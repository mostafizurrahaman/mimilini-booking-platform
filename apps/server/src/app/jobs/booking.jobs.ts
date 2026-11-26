import {
  Account,
  Booking,
  BOOKING_STATUS,
  BOOKING_TIMELINE_MILESTONE,
  NOTIFICATION_TYPE,
  PaymentTransaction,
  PAYMENT_GATEWAY,
  PAYMENT_STAGE_STATUS,
  PAYMENT_STATUS,
  PAYMENT_TRANSACTION_TYPE,
  PromoCodeUsage,
  WALLET_SOURCE,
} from '@repo/db'
import { logger } from '@app/libs/logger'
import { stripe } from '@app/libs/stripe'
import { emitBookingStatusUpdate } from '../modules/Chat/chat.socket'
import { bookingServices } from '../modules/Booking/booking.services'
import { walletServices } from '../modules/Wallet/wallet.services'
import { notificationServices } from '../modules/Notification/notification.services'
import { round2 } from '../modules/Booking/booking.utils'
import moment from 'moment-timezone'

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
      status: { $in: [BOOKING_STATUS.CONFIRMED, BOOKING_STATUS.RESCHEDULED] },
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

          // Refresh customer custom tax invoice and generate balance receipt
          try {
            await bookingServices.generateAndSaveBookingCustomPdf(booking._id.toString())
            await bookingServices.generateAndSaveBalanceReceiptPdf(booking._id.toString())
          } catch {
            // safe fallback
          }

          try {
            await PaymentTransaction.findOneAndUpdate(
              {
                $or: [
                  ...(paymentIntent.id ? [{ stripePaymentIntentId: paymentIntent.id }] : []),
                  { transactionId: `TXN-${booking.bookingNumber}-02` },
                  { booking: (booking as any)._id, type: PAYMENT_TRANSACTION_TYPE.BALANCE_80 },
                ],
              },
              {
                $set: {
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
                },
              },
              { upsert: true, new: true, setDefaultsOnInsert: true }
            )
          } catch (txnErr: any) {
            logger.warn(`[PaymentTransaction] Balance auto-charge audit record notice: ${txnErr?.message}`)
          }

          await bookingServices.recordBookingHistory({
            booking: (booking as any)._id,
            bookingNumber: booking.bookingNumber,
            status: booking.status,
            milestone: BOOKING_TIMELINE_MILESTONE.PAYMENT_COMPLETED,
            title: 'Balance Payment Auto-Charged',
            description: `Remaining 80% balance ($${booking.balancePayment.amount} AUD) auto-charged successfully 24h prior to appointment`,
            performedByRole: 'system',
            metadata: { stripePaymentIntentId: paymentIntent.id },
          })

          try {
            await Promise.all([
              notificationServices.sendNotification({
                recipient: booking.customer,
                title: 'Balance Payment Auto-Charged',
                message: `Your remaining balance ($${booking.balancePayment.amount} AUD) for booking #${booking.bookingNumber} was auto-charged successfully. Your appointment is confirmed!`,
                type: NOTIFICATION_TYPE.PAYMENT_SUCCESS,
                bookingId: booking._id,
                bookingNumber: booking.bookingNumber,
                actionUrl: `/bookings/${booking._id}`,
              }),
              notificationServices.sendNotification({
                recipient: booking.artist,
                title: 'Balance Payment Received',
                message: `Remaining balance ($${booking.balancePayment.amount} AUD) for booking #${booking.bookingNumber} was auto-charged successfully from client. Appointment is ready!`,
                type: NOTIFICATION_TYPE.PAYMENT_SUCCESS,
                bookingId: booking._id,
                bookingNumber: booking.bookingNumber,
                actionUrl: `/bookings/${booking._id}`,
              }),
            ])
          } catch (notifErr) {
            logger.warn('[Booking Notification] Failed to notify parties of 24h balance auto-charge:', notifErr)
          }

          emitBookingStatusUpdate(booking)

          logger.info(
            `[Cron: 24h Balance Auto-Charge] Succeeded for booking ${booking.bookingNumber}`
          )
        }
      } catch (chargeErr: any) {
        booking.balancePayment.status = PAYMENT_STAGE_STATUS.FAILED
        booking.balancePayment.rectificationDeadline = moment().add(2, 'hours').toDate()
        await booking.save()

        emitBookingStatusUpdate(booking)

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

        try {
          await Promise.all([
            notificationServices.sendNotification({
              recipient: booking.customer,
              title: 'Action Required: Balance Auto-Charge Failed',
              message: `Auto-charge for the remaining balance ($${booking.balancePayment.amount} AUD) on booking #${booking.bookingNumber} failed (${chargeErr?.message || 'Card declined'}). Please pay within 2 hours to avoid booking cancellation.`,
              type: NOTIFICATION_TYPE.BOOKING_REMINDER,
              bookingId: booking._id,
              bookingNumber: booking.bookingNumber,
              actionUrl: `/bookings/${booking._id}`,
            }),
            notificationServices.sendNotification({
              recipient: booking.artist,
              title: 'Notice: Client Balance Payment Failed',
              message: `Client auto-charge for booking #${booking.bookingNumber} failed. Client has a 2-hour window to settle payment.`,
              type: NOTIFICATION_TYPE.BOOKING_REMINDER,
              bookingId: booking._id,
              bookingNumber: booking.bookingNumber,
              actionUrl: `/bookings/${booking._id}`,
            }),
          ])
        } catch (notifErr) {
          logger.warn('[Booking Notification] Failed to notify parties of 24h balance charge failure:', notifErr)
        }

        logger.error(
          `[Cron: URGENT 24h Non-Payment Notice] Booking ${booking.bookingNumber} auto-charge failed (${chargeErr?.message}). 2-hour rectification window open until ${booking.balancePayment.rectificationDeadline.toISOString()}. Non-payment will cancel booking and refund deposit minus Platform processing fee.`
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
 * - 20% deposit refunded to customer's platform balance (minus Platform processing fee) as Platform Credit
 * - Any original platform credit applied is restored to wallet
 * - Artist slot released
 */
export const processExpiredRectificationCancellations = async () => {
  try {
    const now = new Date()

    const expiredBookings = await Booking.find({
      status: { $in: [BOOKING_STATUS.CONFIRMED, BOOKING_STATUS.RESCHEDULED] },
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
          description: `Booking #${booking.bookingNumber} non-payment cancellation credit (>24h policy, minus Platform processing fee $${stripeFee})`,
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

      await bookingServices.recordBookingHistory({
        booking: booking._id,
        bookingNumber: booking.bookingNumber,
        status: BOOKING_STATUS.CANCELLED,
        milestone: BOOKING_TIMELINE_MILESTONE.CANCELLED,
        title: 'Booking Cancelled (Balance Payment Timeout)',
        description:
          'Booking was automatically cancelled due to non-payment of remaining 80% balance within the 2-hour rectification window.',
        performedByRole: 'system',
        note: booking.cancellationReason,
      })

      try {
        await Promise.all([
          notificationServices.sendNotification({
            recipient: booking.customer,
            title: 'Booking Cancelled (Payment Timeout)',
            message: `Booking #${booking.bookingNumber} was cancelled because the balance payment was not settled within 2 hours. Your deposit minus fees ($${refundCreditAmount} AUD) has been credited to your wallet.`,
            type: NOTIFICATION_TYPE.BOOKING_CANCELLED,
            bookingId: booking._id,
            bookingNumber: booking.bookingNumber,
            actionUrl: `/bookings/${booking._id}`,
          }),
          notificationServices.sendNotification({
            recipient: booking.artist,
            title: 'Booking Cancelled (Unpaid Slot Released)',
            message: `Booking #${booking.bookingNumber} was cancelled due to client non-payment. Your schedule has been freed up.`,
            type: NOTIFICATION_TYPE.BOOKING_CANCELLED,
            bookingId: booking._id,
            bookingNumber: booking.bookingNumber,
            actionUrl: `/bookings/${booking._id}`,
          }),
        ])
      } catch (notifErr) {
        logger.warn('[Booking Notification] Failed to notify parties of rectification expiry:', notifErr)
      }

      emitBookingStatusUpdate(booking)

      logger.warn(
        `[Cron: Policy Enforced] Booking #${booking.bookingNumber} cancelled due to non-payment. 20% deposit ($${depositPaid}) minus Stripe processing fee ($${stripeFee}) credited to wallet as $${refundCreditAmount}. Slot released.`
      )
    }
  } catch (err: any) {
    logger.error('[Cron: Rectification Expiry] Encountered an error:', err)
  }
}

/**
 * 1-Hour Initial Deposit Timeout Job:
 * If customer does not complete 20% deposit within 1 hour after professional accepts:
 * - Booking is automatically cancelled (status: CANCELLED)
 * - Reason: Customer did not complete initial deposit payment within 1 hour
 * - Original platform credit applied is restored to wallet (if any)
 * - Timeline milestone CANCELLED recorded
 * - Both customer and professional are notified
 * - Professional slot is freed up
 */
export const processExpiredInitialPaymentBookings = async () => {
  try {
    const now = new Date()

    const expiredBookings = await Booking.find({
      status: BOOKING_STATUS.ACCEPTED,
      'initialPayment.status': { $ne: PAYMENT_STAGE_STATUS.CAPTURED },
      $or: [
        { 'initialPayment.dueDate': { $lte: now } },
        {
          'initialPayment.dueDate': null,
          updatedAt: { $lte: moment().subtract(1, 'hour').toDate() },
        },
      ],
    })

    if (expiredBookings.length === 0) return

    logger.warn(
      `[Cron: Initial Payment Expiry] Cancelling ${expiredBookings.length} accepted bookings due to expired 1-hour payment window.`
    )

    for (const booking of expiredBookings) {
      // Restore platform credit if applied
      if (booking.platformCreditApplied > 0) {
        await walletServices.creditUserWallet({
          userId: booking.customer,
          amount: booking.platformCreditApplied,
          source: WALLET_SOURCE.BOOKING_ROLLBACK,
          bookingId: booking._id,
          bookingGroupId: booking.bookingGroupId,
          description: `Booking #${booking.bookingNumber} auto-cancelled (unpaid within 1 hour) - platform credit restored`,
        })
      }

      booking.status = BOOKING_STATUS.CANCELLED
      booking.cancellationReason =
        'Auto-cancelled: Client did not complete initial deposit payment within 1 hour'
      booking.cancelledAt = now
      booking.cancelledByRole = 'system'
      booking.cancellationFeeCharged = 0
      booking.depositForfeited = false
      booking.platformCreditIssued = 0
      await booking.save()

      await bookingServices.recordBookingHistory({
        booking: booking._id,
        bookingNumber: booking.bookingNumber,
        status: BOOKING_STATUS.CANCELLED,
        milestone: BOOKING_TIMELINE_MILESTONE.CANCELLED,
        title: 'Booking Auto-Cancelled (Payment Timeout)',
        description:
          'Booking was automatically cancelled because initial deposit payment was not completed within 1 hour.',
        performedByRole: 'system',
        note: booking.cancellationReason,
      })

      // Notify customer
      try {
        await notificationServices.sendNotification({
          recipient: booking.customer,
          title: 'Booking Cancelled (Payment Expired)',
          message: `Booking #${booking.bookingNumber} has been automatically cancelled because the deposit payment was not completed within 1 hour.`,
          type: NOTIFICATION_TYPE.BOOKING_CANCELLED,
          bookingId: booking._id,
          bookingNumber: booking.bookingNumber,
          actionUrl: `/bookings/${booking._id}`,
        })
      } catch (notifErr) {
        logger.warn('[Booking Notification] Failed to notify customer of payment expiry:', notifErr)
      }

      // Notify professional
      try {
        await notificationServices.sendNotification({
          recipient: booking.artist,
          title: 'Booking Cancelled (Unpaid Slot Released)',
          message: `Booking #${booking.bookingNumber} was automatically cancelled because the client did not pay within 1 hour. Your schedule has been freed up.`,
          type: NOTIFICATION_TYPE.BOOKING_CANCELLED,
          bookingId: booking._id,
          bookingNumber: booking.bookingNumber,
          actionUrl: `/bookings/${booking._id}`,
        })
      } catch (notifErr) {
        logger.warn('[Booking Notification] Failed to notify artist of payment expiry:', notifErr)
      }

      emitBookingStatusUpdate(booking)

      logger.info(
        `[Cron: Initial Payment Expiry] Booking #${booking.bookingNumber} auto-cancelled due to 1-hour payment timeout. Slot released.`
      )
    }
  } catch (err: any) {
    logger.error('[Cron: Initial Payment Expiry] Encountered an error:', err)
  }
}

/**
 * 24-Hour Requested Booking Expiry Job:
 * If an artist does not accept or decline a requested booking within 24 hours
 * (or if the scheduled appointment time arrives/passes before acceptance):
 * - Booking status is transitioned to DECLINED
 * - Reason: Auto-declined: Professional did not accept the request within the 24-hour response window
 * - CancelledAt recorded, cancelledByRole: 'system'
 * - Any platform credit applied is rolled back to customer wallet
 * - Single-use PromoCode / PromoCodeUsage reservation is released
 * - Timeline milestone DECLINED recorded in booking history
 * - In-app notifications sent to both customer and artist
 * - Real-time socket status update emitted
 */
export const processExpiredRequestedBookings = async () => {
  try {
    const now = moment()
    const nowSydney = moment.tz('Australia/Sydney')
    const twentyFourHoursAgo = moment().subtract(24, 'hours').toDate()

    // Find requested bookings created >= 24h ago OR with appointment date in the past / today
    const candidateBookings = await Booking.find({
      status: BOOKING_STATUS.REQUESTED,
      $or: [
        { createdAt: { $lte: twentyFourHoursAgo } },
        { bookingDate: { $lte: nowSydney.clone().endOf('day').toDate() } },
      ],
    })

    if (candidateBookings.length === 0) return

    for (const booking of candidateBookings) {
      const createdAt = (booking as any).createdAt ? moment((booking as any).createdAt) : null
      const isPast24Hours = createdAt ? now.diff(createdAt, 'hours', true) >= 24 : false

      let isPastAppointment = false
      if (booking.bookingDate && booking.startTime) {
        const appointmentDateStr = moment.utc(booking.bookingDate).format('YYYY-MM-DD')
        const appointmentDateTime = moment.tz(
          `${appointmentDateStr} ${booking.startTime}`,
          'YYYY-MM-DD HH:mm',
          'Australia/Sydney'
        )
        if (appointmentDateTime.isValid() && appointmentDateTime.isSameOrBefore(nowSydney)) {
          isPastAppointment = true
        }
      }

      if (!isPast24Hours && !isPastAppointment) {
        continue
      }

      const reason = isPastAppointment
        ? 'Auto-declined: Booking request expired as scheduled appointment time arrived without professional confirmation'
        : 'Auto-declined: Professional did not accept the request within the 24-hour response window'

      // Atomic transition guard: only proceed if status is STILL 'requested'
      const updatedBooking = await Booking.findOneAndUpdate(
        { _id: booking._id, status: BOOKING_STATUS.REQUESTED },
        {
          $set: {
            status: BOOKING_STATUS.DECLINED,
            cancellationReason: reason,
            cancelledAt: now.toDate(),
            cancelledByRole: 'system',
            cancellationFeeCharged: 0,
            depositForfeited: false,
            platformCreditIssued: 0,
          },
        },
        { new: true }
      )

      if (!updatedBooking) {
        // Concurrently accepted, declined, or cancelled by another process
        continue
      }

      logger.warn(
        `[Cron: Requested Booking Expiry] Auto-declined booking #${booking.bookingNumber} (${reason}).`
      )

      // 1. Rollback customer wallet platform credit if applied
      if (booking.platformCreditApplied > 0) {
        try {
          await walletServices.creditUserWallet({
            userId: booking.customer,
            amount: booking.platformCreditApplied,
            source: WALLET_SOURCE.BOOKING_ROLLBACK,
            bookingId: booking._id,
            bookingGroupId: booking.bookingGroupId,
            description: `Booking #${booking.bookingNumber} auto-declined (expired 24h window) - platform credit restored`,
          })
        } catch (walletErr) {
          logger.error(
            `[Cron: Requested Booking Expiry] Failed to refund platform credit for ${booking.bookingNumber}:`,
            walletErr
          )
        }
      }

      // 2. Release PromoCode reservation if applied
      if (booking.promoCode) {
        try {
          await PromoCodeUsage.deleteOne({
            promoCode: booking.promoCode,
            user: (booking.customer as any)._id || booking.customer,
          })
        } catch (promoErr) {
          logger.warn(
            `[Cron: Requested Booking Expiry] Failed to release promo code for ${booking.bookingNumber}:`,
            promoErr
          )
        }
      }

      // 3. Record booking history
      await bookingServices.recordBookingHistory({
        booking: booking._id,
        bookingNumber: booking.bookingNumber,
        status: BOOKING_STATUS.DECLINED,
        milestone: BOOKING_TIMELINE_MILESTONE.DECLINED,
        title: 'Booking Request Expired',
        description: reason,
        performedByRole: 'system',
        note: reason,
      })

      // 4. Send notifications to both customer and artist
      try {
        await Promise.all([
          notificationServices.sendNotification({
            recipient: booking.customer,
            title: 'Booking Request Expired',
            message: `Your booking request #${booking.bookingNumber} has expired because the professional did not respond within 24 hours. Any applied credits have been restored.`,
            type: NOTIFICATION_TYPE.BOOKING_DECLINED,
            bookingId: booking._id,
            bookingNumber: booking.bookingNumber,
            actionUrl: `/bookings/${booking._id}`,
          }),
          notificationServices.sendNotification({
            recipient: booking.artist,
            title: 'Booking Request Expired',
            message: `Booking request #${booking.bookingNumber} has expired as it was not accepted within the 24-hour response window.`,
            type: NOTIFICATION_TYPE.BOOKING_DECLINED,
            bookingId: booking._id,
            bookingNumber: booking.bookingNumber,
            actionUrl: `/bookings/${booking._id}`,
          }),
        ])
      } catch (notifErr) {
        logger.warn(
          '[Booking Notification] Failed to notify parties of requested booking expiry:',
          notifErr
        )
      }

      // 5. Emit real-time status update to connected clients
      emitBookingStatusUpdate(updatedBooking)
    }
  } catch (err: any) {
    logger.error('[Cron: Requested Booking Expiry] Encountered an error:', err)
  }
}

/**
 * Reschedule Request Expiration Job:
 * If recipient does not accept or decline a reschedule request:
 * - Within 24 hours of request submission, OR
 * - Less than 2 hours prior to scheduled appointment time (whichever is earlier):
 * Reschedule request status transitions to 'expired'.
 * The original booking remains active and unchanged.
 * The requested new slot is unblocked.
 * Both customer and professional are notified.
 */
export const processExpiredRescheduleRequests = async () => {
  try {
    const nowSydney = moment.tz('Australia/Sydney')
    const pendingRescheduleBookings = await Booking.find({
      'rescheduleRequest.status': 'pending',
    })

    if (pendingRescheduleBookings.length === 0) return

    for (const booking of pendingRescheduleBookings) {
      if (!booking.rescheduleRequest || booking.rescheduleRequest.status !== 'pending') {
        continue
      }

      const requestCreatedAt = booking.rescheduleRequest.createdAt || (booking as any).updatedAt
      const is24hPassed = requestCreatedAt
        ? moment().diff(moment(requestCreatedAt), 'hours', true) >= 24
        : false

      // Check original appointment time
      let isWithin2hOfAppt = false
      if (booking.bookingDate && booking.startTime) {
        const apptDateStr = moment.utc(booking.bookingDate).format('YYYY-MM-DD')
        const apptDateTime = moment.tz(
          `${apptDateStr} ${booking.startTime}`,
          'YYYY-MM-DD HH:mm',
          'Australia/Sydney'
        )
        if (apptDateTime.isValid()) {
          const hoursUntilAppt = apptDateTime.diff(nowSydney, 'hours', true)
          if (hoursUntilAppt <= 2) {
            isWithin2hOfAppt = true
          }
        }
      }

      // Check requested new appointment time
      let isWithin2hOfNewTime = false
      if (booking.rescheduleRequest.newDate && booking.rescheduleRequest.newStartTime) {
        const newDateStr = moment.utc(booking.rescheduleRequest.newDate).format('YYYY-MM-DD')
        const newDateTime = moment.tz(
          `${newDateStr} ${booking.rescheduleRequest.newStartTime}`,
          'YYYY-MM-DD HH:mm',
          'Australia/Sydney'
        )
        if (newDateTime.isValid()) {
          const hoursUntilNew = newDateTime.diff(nowSydney, 'hours', true)
          if (hoursUntilNew <= 2) {
            isWithin2hOfNewTime = true
          }
        }
      }

      if (!is24hPassed && !isWithin2hOfAppt && !isWithin2hOfNewTime) {
        continue
      }

      const expireReason =
        isWithin2hOfAppt || isWithin2hOfNewTime
          ? 'Expired: Reschedule window closed as appointment time is within 2 hours'
          : 'Expired: Reschedule request was not confirmed within the 24-hour response window'

      // Atomic status transition
      const updatedBooking = await Booking.findOneAndUpdate(
        { _id: booking._id, 'rescheduleRequest.status': 'pending' },
        {
          $set: {
            'rescheduleRequest.status': 'expired',
            'rescheduleRequest.respondedAt': new Date(),
            'rescheduleRequest.declineReason': expireReason,
          },
        },
        { new: true }
      )

      if (!updatedBooking) continue

      logger.warn(
        `[Cron: Reschedule Expiry] Reschedule request expired for booking #${booking.bookingNumber} (${expireReason}). Original schedule stands.`
      )

      // Record timeline history
      await bookingServices.recordBookingHistory({
        booking: booking._id,
        bookingNumber: booking.bookingNumber,
        status: booking.status,
        milestone: BOOKING_TIMELINE_MILESTONE.RESCHEDULED,
        title: 'Reschedule Request Expired',
        description: `Reschedule request expired (${expireReason}). Original appointment on ${moment(booking.bookingDate).format('DD MMM YYYY')} at ${booking.startTime} remains in place.`,
        performedByRole: 'system',
        note: expireReason,
      })

      // Notify both parties
      const apptFormatted = `${moment(booking.bookingDate).format('DD MMM YYYY')} at ${booking.startTime}`
      try {
        await Promise.all([
          notificationServices.sendNotification({
            recipient: (booking.customer as any)._id || booking.customer,
            title: 'Reschedule Request Expired',
            message: `The reschedule request for booking #${booking.bookingNumber} has expired without confirmation. Your original appointment on ${apptFormatted} remains in place.`,
            type: NOTIFICATION_TYPE.BOOKING_RESCHEDULED,
            bookingId: booking._id,
            bookingNumber: booking.bookingNumber,
            actionUrl: `/bookings/${booking._id}`,
          }),
          notificationServices.sendNotification({
            recipient: (booking.artist as any)._id || booking.artist,
            title: 'Reschedule Request Expired',
            message: `The reschedule request for booking #${booking.bookingNumber} has expired without confirmation. Original appointment on ${apptFormatted} remains scheduled.`,
            type: NOTIFICATION_TYPE.BOOKING_RESCHEDULED,
            bookingId: booking._id,
            bookingNumber: booking.bookingNumber,
            actionUrl: `/bookings/${booking._id}`,
          }),
        ])
      } catch (notifErr) {
        logger.warn('[Booking Notification] Failed to notify parties of reschedule expiry:', notifErr)
      }

      emitBookingStatusUpdate(updatedBooking)
    }
  } catch (err: any) {
    logger.error('[Cron: Reschedule Expiry] Encountered an error:', err)
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
            failureReason: 'Professional payout transfer pending available balance',
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

        if (freshTxn.artist) {
          try {
            await notificationServices.sendNotification({
              recipient: freshTxn.artist,
              title: 'Payout Released',
              message: `Your payout of $${freshTxn.artistNetShare} AUD has been transferred to your Stripe account.`,
              type: NOTIFICATION_TYPE.PAYMENT_SUCCESS,
              bookingId: freshTxn.booking ? freshTxn.booking.toString() : undefined,
              actionUrl: '/finances',
            })
          } catch (notifErr) {
            logger.warn('[Booking Notification] Failed to notify artist of payout transfer:', notifErr)
          }
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

  // Run 1-hour initial deposit timeout check immediately and then every 2 minutes
  processExpiredInitialPaymentBookings()
  const initialPaymentTimeoutInterval = setInterval(
    processExpiredInitialPaymentBookings,
    2 * 60 * 1000
  )

  // Run 24-hour requested booking expiration check immediately and then every 2 minutes
  processExpiredRequestedBookings()
  const requestedExpiryInterval = setInterval(
    processExpiredRequestedBookings,
    2 * 60 * 1000
  )

  // Run reschedule request expiration check immediately and then every 2 minutes
  processExpiredRescheduleRequests()
  const rescheduleExpiryInterval = setInterval(
    processExpiredRescheduleRequests,
    2 * 60 * 1000
  )

  // Run pending artist payout retry every day at 09:00 AM
  scheduleDailyAt9AM(processPendingArtistPayouts)

  // Unref intervals so they don't block clean process shutdown if needed
  if (balanceInterval.unref) balanceInterval.unref()
  if (rectificationInterval.unref) rectificationInterval.unref()
  if (initialPaymentTimeoutInterval.unref) initialPaymentTimeoutInterval.unref()
  if (requestedExpiryInterval.unref) requestedExpiryInterval.unref()
  if (rescheduleExpiryInterval.unref) rescheduleExpiryInterval.unref()
}
