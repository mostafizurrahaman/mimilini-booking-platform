import {
  Account,
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

const activePayoutRetryLocks = new Set<string>()

/**
 * Pending Artist Payout Retry Job:
 * Automatically retries Stripe transfers that were queued as PENDING due to
 * Stripe settlement delay (insufficient available balance at the moment of sign/cancel/no-show).
 */
export const processPendingArtistPayouts = async () => {
  try {
    // 1. Ensure any signed completed booking without payoutTransferredAt has a PENDING payout transaction queued
    const unsignedPayoutBookings = await Booking.find({
      status: BOOKING_STATUS.COMPLETED,
      'completionDetails.signedAt': { $ne: null },
      'completionDetails.payoutTransferredAt': null,
      artistNetPayout: { $gt: 0 },
    })

    for (const bk of unsignedPayoutBookings) {
      const signTxnId = `TXN-${bk.bookingNumber}-SIGN-PAYOUT`
      await PaymentTransaction.findOneAndUpdate(
        { transactionId: signTxnId },
        {
          $setOnInsert: {
            transactionId: signTxnId,
            booking: bk._id,
            bookingGroupId: bk.bookingGroupId || `GRP-${bk.bookingNumber}`,
            user: bk.customer,
            artist: bk.artist,
            type: PAYMENT_TRANSACTION_TYPE.STRIPE_TRANSFER,
            gateway: PAYMENT_GATEWAY.STRIPE_CONNECT,
            status: PAYMENT_STATUS.PENDING,
            currency: 'AUD',
            amount: bk.totalBookingPrice || bk.grossAmount || 0,
            marketplaceFee: bk.platformCommissionAmount || 0,
            marketplaceFeeGst: bk.platformCommissionGst || 0,
            stripeFeeBorne: bk.stripeBalanceFee || 0,
            artistNetShare: bk.artistNetPayout,
            failureReason: 'Artist payout transfer pending available balance',
          },
        },
        { upsert: true, new: true }
      )
    }

    // 2. Process all PENDING artist payout transactions once Stripe available balance is sufficient
    const pendingTxns = await PaymentTransaction.find({
      gateway: PAYMENT_GATEWAY.STRIPE_CONNECT,
      status: PAYMENT_STATUS.PENDING,
      stripeTransferId: null,
      artistNetShare: { $gt: 0 },
      transactionId: { $regex: /-(SIGN-PAYOUT|LATE-CANCEL|NO-SHOW-PAYOUT)$/ },
    })

    if (pendingTxns.length === 0) return

    const balance = await stripe.balance.retrieve()
    let availableAudCents =
      balance.available.find((b) => b.currency.toLowerCase() === 'aud')?.amount ?? 0

    for (const txn of pendingTxns) {
      if (activePayoutRetryLocks.has(txn.transactionId)) continue
      const amountCents = Math.round(txn.artistNetShare * 100)
      if (availableAudCents < amountCents) {
        continue
      }

      if (!txn.artist) continue
      const artistAccount = await Account.findOne({ user: txn.artist })
      if (!artistAccount?.account) continue

      activePayoutRetryLocks.add(txn.transactionId)
      try {
        // Re-verify in DB right before transfer to prevent any race condition
        const freshTxn = await PaymentTransaction.findOne({
          _id: txn._id,
          status: PAYMENT_STATUS.PENDING,
          stripeTransferId: null,
        })
        if (!freshTxn) continue

        const transfer = await stripe.transfers.create({
          amount: amountCents,
          currency: 'aud',
          destination: artistAccount.account,
          ...(freshTxn.bookingGroupId ? { transfer_group: freshTxn.bookingGroupId } : {}),
          metadata: {
            bookingId: freshTxn.booking?.toString() || '',
            transactionId: freshTxn.transactionId,
            type: 'RETRY_ARTIST_PAYOUT',
          },
        })

        availableAudCents -= amountCents
        freshTxn.status = PAYMENT_STATUS.SUCCEEDED
        freshTxn.stripeTransferId = transfer.id
        ;(freshTxn as any).failureReason = null
        await freshTxn.save()

        if (freshTxn.booking && freshTxn.transactionId.endsWith('-SIGN-PAYOUT')) {
          await Booking.findByIdAndUpdate(freshTxn.booking, {
            $set: { 'completionDetails.payoutTransferredAt': new Date() },
          })
        }

        logger.info(
          `[Cron: Pending Artist Payouts] Succeeded transfer ${transfer.id} ($${freshTxn.artistNetShare} AUD) for ${freshTxn.transactionId}`
        )
      } catch (err: any) {
        txn.failureReason = err?.message || 'Transfer still pending available balance'
        await txn.save()
      } finally {
        activePayoutRetryLocks.delete(txn.transactionId)
      }
    }
  } catch (err: any) {
    logger.error('[Cron: Pending Artist Payouts] Encountered an error:', err)
  }
}

/**
 * Schedule a job to run every day at 09:00 AM server time
 */
const scheduleDailyAt9AM = (task: () => Promise<void>) => {
  const scheduleNextRun = () => {
    const now = moment()
    let next9AM = moment().set({ hour: 9, minute: 0, second: 0, millisecond: 0 })
    if (now.isSameOrAfter(next9AM)) {
      next9AM = next9AM.add(1, 'day')
    }
    const msUntilNext9AM = next9AM.diff(now)

    const timer = setTimeout(async () => {
      await task()
      scheduleNextRun()
    }, msUntilNext9AM)

    if (timer.unref) timer.unref()
  }

  scheduleNextRun()
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

  // Run pending artist payout retry every day at 09:00 AM
  scheduleDailyAt9AM(processPendingArtistPayouts)

  // Unref intervals so they don't block clean process shutdown if needed
  if (balanceInterval.unref) balanceInterval.unref()
  if (rectificationInterval.unref) rectificationInterval.unref()
}
