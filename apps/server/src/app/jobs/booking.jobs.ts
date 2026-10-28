import {
  Booking,
  BOOKING_STATUS,
  PaymentTransaction,
  PAYMENT_GATEWAY,
  PAYMENT_STAGE_STATUS,
  PAYMENT_STATUS,
  PAYMENT_TRANSACTION_TYPE,
  WALLET_SOURCE,
} from '@repo/db'
import { logger } from '@app/libs/logger'
import { stripe } from '@app/libs/stripe'
import { bookingServices } from '../modules/Booking/booking.services'
import { walletServices } from '../modules/Wallet/wallet.services'
import { round2 } from '../modules/Booking/booking.utils'
import moment from 'moment'

/**
 * 24-Hour Prior Balance Capture Job:
 * Automatically triggers off-session payment for the remaining 80% balance
 * exactly 24 hours prior to appointment time.
 */
export const process24HourBalancePayments = async () => {
  try {
    const now = new Date()
    const in24Hours = moment().add(24, 'hours').toDate()

    const pendingBookings = await Booking.find({
      status: BOOKING_STATUS.CONFIRMED,
      'balancePayment.status': PAYMENT_STAGE_STATUS.PENDING,
      'balancePayment.amount': { $gt: 0 },
      $or: [
        { 'balancePayment.dueDate': { $lte: now } },
        { 'balancePayment.dueDate': null, bookingDate: { $lte: in24Hours } },
      ],
    })

    if (pendingBookings.length === 0) return

    logger.info(
      `[Cron: 24h Balance Auto-Charge] Processing ${pendingBookings.length} bookings due for 80% balance capture.`
    )

    for (const booking of pendingBookings) {
      if (!booking.stripePaymentMethodId) {
        booking.balancePayment.status = PAYMENT_STAGE_STATUS.FAILED
        booking.balancePayment.rectificationDeadline = moment().add(2, 'hours').toDate()
        await booking.save()

        logger.error(
          `[Cron: 24h Balance Auto-Charge] Booking ${booking.bookingNumber} has no saved payment method. Granted 2-hour rectification until ${booking.balancePayment.rectificationDeadline.toISOString()}`
        )
        continue
      }

      try {
        const transferGroup = booking.bookingGroupId || `GRP-${booking.bookingNumber}`
        const piParams: any = {
          amount: Math.round(booking.balancePayment.amount * 100),
          currency: 'aud',
          payment_method: booking.stripePaymentMethodId,
          off_session: true,
          confirm: true,
          transfer_group: transferGroup,
          metadata: {
            bookingNumber: booking.bookingNumber,
            bookingGroupId: transferGroup,
            bookingId: (booking as any)._id.toString(),
            userId: booking.customer.toString(),
            artistId: booking.artist.toString(),
            type: PAYMENT_TRANSACTION_TYPE.BALANCE_80,
            stripeGstTaxRateId: booking.stripeGstTaxRateId || '',
          },
        }
        if (booking.stripeCustomerId) {
          piParams.customer = booking.stripeCustomerId
        }

        const paymentIntent = await stripe.paymentIntents.create(piParams)

        if (paymentIntent.status === 'succeeded') {
          let stripeReceiptUrl: string | null = null
          if (paymentIntent.latest_charge) {
            const chargeId =
              typeof paymentIntent.latest_charge === 'string'
                ? paymentIntent.latest_charge
                : (paymentIntent.latest_charge as any).id
            try {
              const charge = await stripe.charges.retrieve(chargeId)
              stripeReceiptUrl = charge.receipt_url || null
            } catch (chargeErr: any) {
              logger.warn(`Failed to retrieve charge receipt url: ${chargeErr?.message}`)
            }
          }

          booking.balancePayment.status = PAYMENT_STAGE_STATUS.CAPTURED
          booking.balancePayment.paidAt = new Date()
          booking.balancePayment.stripePaymentIntentId = paymentIntent.id
          booking.balancePayment.stripeReceiptUrl = stripeReceiptUrl
          booking.status = BOOKING_STATUS.CONFIRMED
          await booking.save()

          // Mark customer invoice paid in full in Stripe
          if (booking.stripeInvoiceId) {
            try {
              await stripe.invoices.pay(booking.stripeInvoiceId, { paid_out_of_band: true })
            } catch (e: any) {
              // safe fallback
            }
          }

          // Issue Artist RCTI invoice
          await bookingServices.issueArtistRctiStripeInvoice(booking)

          await PaymentTransaction.create({
            transactionId: `TXN-${booking.bookingNumber}-02`,
            booking: (booking as any)._id,
            bookingGroupId: transferGroup,
            user: booking.customer,
            artist: booking.artist,
            type: PAYMENT_TRANSACTION_TYPE.BALANCE_80,
            gateway: PAYMENT_GATEWAY.STRIPE_CONNECT,
            status: PAYMENT_STATUS.SUCCEEDED,
            currency: 'AUD',
            amount: booking.balancePayment.amount,
            stripePaymentIntentId: paymentIntent.id,
            marketplaceFee: 0,
            marketplaceFeeGst: 0,
            stripeFeeBorne: booking.stripeBalanceFee,
            artistNetShare: booking.artistNetPayout,
          })

          logger.info(
            `[Cron: 24h Balance Auto-Charge] Succeeded for booking ${booking.bookingNumber}`
          )
        }
      } catch (chargeErr: any) {
        booking.balancePayment.status = PAYMENT_STAGE_STATUS.FAILED
        booking.balancePayment.rectificationDeadline = moment().add(2, 'hours').toDate()
        await booking.save()

        const transferGroup = booking.bookingGroupId || `GRP-${booking.bookingNumber}`
        await PaymentTransaction.create({
          transactionId: `TXN-${booking.bookingNumber}-02-FAIL`,
          booking: (booking as any)._id,
          bookingGroupId: transferGroup,
          user: booking.customer,
          artist: booking.artist,
          type: PAYMENT_TRANSACTION_TYPE.BALANCE_80,
          gateway: PAYMENT_GATEWAY.STRIPE_CONNECT,
          status: PAYMENT_STATUS.FAILED,
          currency: 'AUD',
          amount: booking.balancePayment.amount,
          marketplaceFee: 0,
          marketplaceFeeGst: 0,
          stripeFeeBorne: booking.stripeBalanceFee,
          artistNetShare: 0,
          failureReason: chargeErr?.message || 'Off-session card charge declined',
        })

        logger.error(
          `[Cron: URGENT 24h Non-Payment Notice] Booking ${booking.bookingNumber} auto-charge failed (${chargeErr?.message}). 2-hour rectification window open until ${booking.balancePayment.rectificationDeadline.toISOString()}. Non-payment will cancel booking and refund deposit minus Stripe processing fee.`
        )
      }
    }
  } catch (err: any) {
    logger.error('[Cron: 24h Balance Auto-Charge] Encountered an error:', err)
  }
}

/**
 * 2-Hour Rectification Expiry Job:
 * If customer does not rectify failed 80% balance payment within 2 hours:
 * - Booking cancelled (status: CANCELLED_DUE_TO_NONPAYMENT)
 * - 20% deposit refunded to customer's platform balance (minus Stripe processing fee) as Platform Credit
 * - Any original platform credit applied is restored to wallet
 * - Artist slot released
 */
export const processExpiredRectificationCancellations = async () => {
  try {
    const now = new Date()

    const expiredBookings = await Booking.find({
      status: BOOKING_STATUS.CONFIRMED,
      'balancePayment.status': PAYMENT_STAGE_STATUS.FAILED,
      'balancePayment.rectificationDeadline': { $lte: now },
    })

    if (expiredBookings.length === 0) return

    logger.warn(
      `[Cron: Rectification Expiry] Cancelling ${expiredBookings.length} bookings due to expired 2-hour rectification window.`
    )

    for (const booking of expiredBookings) {
      const depositPaid = booking.initialPayment?.amount || 0
      const stripeFee = booking.stripeInitialFee || 0
      const refundCreditAmount = round2(Math.max(0, depositPaid - stripeFee))

      if (refundCreditAmount > 0) {
        await walletServices.creditUserWallet({
          userId: booking.customer,
          amount: refundCreditAmount,
          source: WALLET_SOURCE.CANCELLATION_CREDIT,
          bookingId: booking._id,
          bookingGroupId: booking.bookingGroupId,
          description: `Booking #${booking.bookingNumber} non-payment cancellation credit (>24h policy, minus Stripe processing fee $${stripeFee})`,
        })
      }

      if (booking.platformCreditApplied > 0) {
        await walletServices.creditUserWallet({
          userId: booking.customer,
          amount: booking.platformCreditApplied,
          source: WALLET_SOURCE.BOOKING_ROLLBACK,
          bookingId: booking._id,
          bookingGroupId: booking.bookingGroupId,
          description: `Booking #${booking.bookingNumber} non-payment cancellation - platform credit restored`,
        })
      }

      booking.status = BOOKING_STATUS.CANCELLED
      booking.cancellationReason =
        'Non-payment of remaining 80% balance within 2-hour rectification window'
      booking.cancelledAt = now
      booking.cancelledByRole = 'system'
      booking.platformCreditIssued = refundCreditAmount
      booking.initialPayment.status = PAYMENT_STAGE_STATUS.REFUNDED
      await booking.save()

      logger.warn(
        `[Cron: Policy Enforced] Booking #${booking.bookingNumber} cancelled due to non-payment. 20% deposit ($${depositPaid}) minus Stripe processing fee ($${stripeFee}) credited to wallet as $${refundCreditAmount}. Slot released.`
      )
    }
  } catch (err: any) {
    logger.error('[Cron: Rectification Expiry] Encountered an error:', err)
  }
}

/**
 * Initialize background automation timers
 */
export const startBookingCronJobs = () => {
  logger.info('⏰ Initializing Booking Automation Cron Jobs...')

  // Run 24h balance charge check immediately and then every 10 minutes
  process24HourBalancePayments()
  const balanceInterval = setInterval(process24HourBalancePayments, 10 * 60 * 1000)

  // Run 1-hour rectification check immediately and then every 2 minutes
  processExpiredRectificationCancellations()
  const rectificationInterval = setInterval(
    processExpiredRectificationCancellations,
    2 * 60 * 1000
  )

  // Unref intervals so they don't block clean process shutdown if needed
  if (balanceInterval.unref) balanceInterval.unref()
  if (rectificationInterval.unref) rectificationInterval.unref()
}
