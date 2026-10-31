import { logger } from '@app/libs/logger'
import {
  Account,
  accountStatus,
  ArtistProfile,
  AuthStatus,
  Booking,
  BOOKING_STATUS,
  PaymentTransaction,
  PAYMENT_GATEWAY,
  PAYMENT_STAGE_STATUS,
  PAYMENT_STATUS,
  PAYMENT_TRANSACTION_TYPE,
  Penalty,
  PENALTY_STATUS,
  PlatformSettings,
  PromoCode,
  type TAccountStatus,
  User,
  WalletLedger,
  WALLET_SOURCE,
} from '@repo/db'
import { AppError } from '@repo/shared'
import Stripe from 'stripe'
import httpStatus from 'http-status'
import moment from 'moment'
import { stripe } from '@app/libs/stripe'
import { walletServices } from '../Wallet/wallet.services'
import { bookingServices } from '../Booking/booking.services'
import { calculateArtistCancellationPenalty, round2 } from '../Booking/booking.utils'

// Account Updated Event:
const handleAccountUpdated = async (event: Stripe.Event) => {
  const accountData = event.data.object as Stripe.Account

  let userId = accountData?.metadata?.userId
  let user = userId ? await User.findById(userId) : null

  if (!user && accountData?.id) {
    const existingAccount = await Account.findOne({ account: accountData.id })
    if (existingAccount?.user) {
      user = await User.findById(existingAccount.user)
    }
  }

  if (!user) {
    logger.info(
      `[Stripe Webhook] account.updated: No matching user found for account ${accountData?.id}. Skipping gracefully.`
    )
    return
  }

  // ? Extract account information:
  const detailsSubmitted = accountData?.details_submitted ?? false
  const chargesEnabled = accountData.charges_enabled ?? false
  const payoutsEnabled = accountData.payouts_enabled ?? false
  const isAccountActive = detailsSubmitted && chargesEnabled && payoutsEnabled
  const hasRequirements =
    (accountData.requirements?.currently_due?.length ?? 0) > 0 ||
    (accountData.requirements?.past_due?.length ?? 0) > 0
  const disabledReason = accountData.requirements?.disabled_reason || null

  let status: TAccountStatus = accountStatus.PENDING

  if (disabledReason || hasRequirements) {
    status = accountStatus.RESTRICTED
  } else if (isAccountActive) {
    status = accountStatus.ACTIVE
  } else {
    status = accountStatus.PENDING
  }

  await Account.findOneAndUpdate(
    {
      account: accountData?.id,
      user: user?._id,
    },
    {
      $set: {
        status,
        detailsSubmitted,
        payoutsEnabled,
        chargesEnabled,
        disabledReason,
      },
    },
    {
      runValidators: true,
      new: true,
    }
  )

  user.isStripeConnected = status === accountStatus.ACTIVE
  await user.save()
}

// PaymentIntent Succeeded Event (20% Initial Deposit or 80% Balance)
const handlePaymentIntentSucceeded = async (paymentIntent: Stripe.PaymentIntent) => {
  const metadata = paymentIntent.metadata || {}
  const bookingNumber = metadata.bookingNumber
  const txnType = metadata.type

  if (!bookingNumber) {
    logger.info(
      `[Stripe Webhook] PaymentIntent ${paymentIntent.id} has no bookingNumber in metadata. Skipping booking update.`
    )
    return
  }

  const booking = await Booking.findOne({ bookingNumber })
  if (!booking) {
    logger.warn(`[Stripe Webhook] Booking not found for bookingNumber: ${bookingNumber}`)
    return
  }

  if (txnType === PAYMENT_TRANSACTION_TYPE.INITIAL_20) {
    if (booking.initialPayment.status !== PAYMENT_STAGE_STATUS.CAPTURED) {
      booking.initialPayment.status = PAYMENT_STAGE_STATUS.CAPTURED
      booking.initialPayment.paidAt = new Date()
      booking.initialPayment.stripePaymentIntentId = paymentIntent.id
      if (
        booking.status === BOOKING_STATUS.REQUESTED ||
        booking.status === BOOKING_STATUS.ACCEPTED
      ) {
        booking.status = BOOKING_STATUS.CONFIRMED
      }
      await booking.save()
    }

    // Idempotently issue official Customer Master Tax Invoice in Stripe if not already created
    if (!booking.stripeInvoiceId) {
      await bookingServices.issueCustomerStripeInvoice(booking)
    }

    await PaymentTransaction.findOneAndUpdate(
      {
        $or: [
          { stripePaymentIntentId: paymentIntent.id },
          { booking: (booking as any)._id, type: PAYMENT_TRANSACTION_TYPE.INITIAL_20 },
        ],
      },
      {
        $set: {
          status: PAYMENT_STATUS.SUCCEEDED,
          stripePaymentIntentId: paymentIntent.id,
        },
      }
    )
    logger.info(`[Stripe Webhook] Initial 20% deposit confirmed for booking ${bookingNumber}`)
  } else if (txnType === PAYMENT_TRANSACTION_TYPE.BALANCE_80) {
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
    if (stripeReceiptUrl) {
      booking.balancePayment.stripeReceiptUrl = stripeReceiptUrl
    }
    booking.status = BOOKING_STATUS.CONFIRMED
    await booking.save()

    // Mark master customer invoice paid in full in Stripe
    if (booking.stripeInvoiceId) {
      try {
        await stripe.invoices.pay(booking.stripeInvoiceId, { paid_out_of_band: true })
      } catch (e: any) {
        // safe fallback
      }
    }

    // Automatically issue official Recipient Created Tax Invoice (RCTI) for artist
    await bookingServices.issueArtistRctiStripeInvoice(booking)

    const transferGroup =
      booking.bookingGroupId || metadata.bookingGroupId || `GRP-${booking.bookingNumber}`

    await PaymentTransaction.findOneAndUpdate(
      {
        $or: [
          { stripePaymentIntentId: paymentIntent.id },
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
    logger.info(`[Stripe Webhook] 80% Balance payment confirmed for booking ${bookingNumber}`)
  }
}

// Invoice Payment Succeeded Event (When customer pays directly via the raised Stripe Invoice URL)
const handleInvoicePaymentSucceeded = async (invoice: Stripe.Invoice) => {
  const bookingNumber = invoice.metadata?.bookingNumber
  const booking = await Booking.findOne({
    $or: [{ stripeInvoiceId: invoice.id }, ...(bookingNumber ? [{ bookingNumber }] : [])],
  })
  if (!booking) {
    logger.info(`[Stripe Webhook] No booking matched for invoice ${invoice.id}`)
    return
  }

  // Idempotent: If balance was already captured via app/card, ignore
  if (booking.balancePayment?.status === PAYMENT_STAGE_STATUS.CAPTURED) {
    return
  }

  const rawPaymentIntent = (invoice as any).payment_intent
  const paymentIntentId =
    typeof rawPaymentIntent === 'string' ? rawPaymentIntent : rawPaymentIntent?.id || null

  booking.balancePayment.status = PAYMENT_STAGE_STATUS.CAPTURED
  booking.balancePayment.paidAt = new Date()
  if (paymentIntentId) {
    booking.balancePayment.stripePaymentIntentId = paymentIntentId
  }
  if (invoice.hosted_invoice_url) {
    booking.balancePayment.stripeReceiptUrl = invoice.hosted_invoice_url
  }
  booking.status = BOOKING_STATUS.CONFIRMED
  await booking.save()

  // Issue official RCTI for the artist
  await bookingServices.issueArtistRctiStripeInvoice(booking)

  const transferGroup =
    booking.bookingGroupId || invoice.metadata?.bookingGroupId || `GRP-${booking.bookingNumber}`

  await PaymentTransaction.findOneAndUpdate(
    {
      $or: [
        ...(paymentIntentId ? [{ stripePaymentIntentId: paymentIntentId }] : []),
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
        stripePaymentIntentId: paymentIntentId || invoice.id,
        marketplaceFee: 0,
        marketplaceFeeGst: 0,
        stripeFeeBorne: booking.stripeBalanceFee,
        artistNetShare: booking.artistNetPayout,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  )

  logger.info(
    `[Stripe Webhook] Balance paid directly via raised Stripe Invoice for booking ${booking.bookingNumber}`
  )
}

// PaymentIntent Failed Event
const handlePaymentIntentFailed = async (paymentIntent: Stripe.PaymentIntent) => {
  const metadata = paymentIntent.metadata || {}
  const bookingNumber = metadata.bookingNumber
  const txnType = metadata.type

  if (!bookingNumber) return

  const booking = await Booking.findOne({ bookingNumber })
  if (!booking) return

  if (txnType === PAYMENT_TRANSACTION_TYPE.INITIAL_20) {
    // Rollback wallet credit if used
    if (booking.platformCreditApplied > 0) {
      await walletServices.rollbackDebit(
        booking.customer,
        booking.platformCreditApplied,
        (booking as any)._id,
        'Initial deposit payment failed - credit reversed'
      )
    }

    // Release promo code if applied
    if (booking.promoCode) {
      await PromoCode.findByIdAndUpdate(booking.promoCode, { $inc: { usageCount: -1 } })
      logger.info(`[Stripe Webhook] Released promo code for failed booking ${bookingNumber}`)
    }

    booking.initialPayment.status = PAYMENT_STAGE_STATUS.FAILED
    booking.status = BOOKING_STATUS.CANCELLED
    await booking.save()

    await PaymentTransaction.findOneAndUpdate(
      {
        $or: [
          { stripePaymentIntentId: paymentIntent.id },
          { booking: (booking as any)._id, type: PAYMENT_TRANSACTION_TYPE.INITIAL_20 },
        ],
      },
      {
        $set: {
          status: PAYMENT_STATUS.FAILED,
          stripePaymentIntentId: paymentIntent.id,
          failureReason: paymentIntent.last_payment_error?.message || 'Payment failed',
        },
      }
    )
    logger.warn(`[Stripe Webhook] Initial 20% payment failed for booking ${bookingNumber}`)
  } else if (txnType === PAYMENT_TRANSACTION_TYPE.BALANCE_80) {
    booking.balancePayment.status = PAYMENT_STAGE_STATUS.FAILED
    if (!booking.balancePayment.rectificationDeadline) {
      booking.balancePayment.rectificationDeadline = moment().add(2, 'hours').toDate()
    }
    await booking.save()

    await PaymentTransaction.findOneAndUpdate(
      {
        $or: [
          { stripePaymentIntentId: paymentIntent.id },
          { booking: (booking as any)._id, type: PAYMENT_TRANSACTION_TYPE.BALANCE_80 },
        ],
      },
      {
        $set: {
          status: PAYMENT_STATUS.FAILED,
          stripePaymentIntentId: paymentIntent.id,
          failureReason: paymentIntent.last_payment_error?.message || 'Payment failed',
        },
      }
    )

    logger.error(
      `[URGENT] 80% Balance payment failed for booking ${bookingNumber}. 1-hour rectification window granted until: ${booking.balancePayment.rectificationDeadline.toISOString()}`
    )
  }
}

// PaymentIntent Canceled Event
const handlePaymentIntentCanceled = async (paymentIntent: Stripe.PaymentIntent) => {
  const invoiceId = (paymentIntent as any).invoice
  // If this PaymentIntent was automatically generated for an invoice that was settled out-of-band, ignore it
  if (invoiceId) {
    logger.info(
      `[Stripe Webhook] Ignoring canceled invoice PaymentIntent ${paymentIntent.id} (invoice: ${invoiceId})`
    )
    return
  }

  const metadata = paymentIntent.metadata || {}
  const bookingNumber = metadata.bookingNumber
  if (!bookingNumber) return

  const booking = await Booking.findOne({ bookingNumber })
  if (booking) {
    if (booking.platformCreditApplied > 0) {
      await walletServices.rollbackDebit(
        booking.customer,
        booking.platformCreditApplied,
        (booking as any)._id,
        'Booking PaymentIntent canceled - platform credit reversed'
      )
    }
    if (booking.promoCode) {
      await PromoCode.findByIdAndUpdate(booking.promoCode, { $inc: { usageCount: -1 } })
      logger.info(`[Stripe Webhook] Released promo code for canceled booking ${bookingNumber}`)
    }
    booking.status = BOOKING_STATUS.CANCELLED
    await booking.save()
  }

  await PaymentTransaction.findOneAndUpdate(
    { stripePaymentIntentId: paymentIntent.id },
    { $set: { status: PAYMENT_STATUS.FAILED, failureReason: 'PaymentIntent canceled' } }
  )
}

// Charge Refunded Event (Cancellation / Refund processed via Stripe)
const handleChargeRefunded = async (charge: Stripe.Charge) => {
  const paymentIntentId =
    typeof charge.payment_intent === 'string'
      ? charge.payment_intent
      : (charge.payment_intent as any)?.id

  const bookingNumber = charge.metadata?.bookingNumber

  // 1. Update PaymentTransaction to REFUNDED
  const txn = await PaymentTransaction.findOneAndUpdate(
    {
      $or: [
        ...(paymentIntentId ? [{ stripePaymentIntentId: paymentIntentId }] : []),
        ...(bookingNumber ? [{ transactionId: new RegExp(bookingNumber) }] : []),
      ],
    },
    {
      $set: {
        status: PAYMENT_STATUS.REFUNDED,
      },
    },
    { new: true }
  )

  // 2. Find associated Booking
  const booking = await Booking.findOne({
    $or: [
      ...(bookingNumber ? [{ bookingNumber }] : []),
      ...(txn?.booking ? [{ _id: txn.booking }] : []),
      ...(paymentIntentId
        ? [
            { 'initialPayment.stripePaymentIntentId': paymentIntentId },
            { 'balancePayment.stripePaymentIntentId': paymentIntentId },
          ]
        : []),
    ],
  }).populate('customer artist')

  if (!booking) {
    logger.warn(`[Stripe Webhook] charge.refunded: No booking found for charge ${charge.id}`)
    return
  }

  // 3. Mark stage payment status as REFUNDED
  if (paymentIntentId && booking.initialPayment.stripePaymentIntentId === paymentIntentId) {
    booking.initialPayment.status = PAYMENT_STAGE_STATUS.REFUNDED
  }
  if (paymentIntentId && booking.balancePayment.stripePaymentIntentId === paymentIntentId) {
    booking.balancePayment.status = PAYMENT_STAGE_STATUS.REFUNDED
  }

  // 4. Release promo code if not already released and booking wasn't already cancelled
  const isAlreadyCancelled = booking.status === BOOKING_STATUS.CANCELLED

  if (booking.promoCode && !isAlreadyCancelled) {
    await PromoCode.findByIdAndUpdate(booking.promoCode, { $inc: { usageCount: -1 } })
    logger.info(
      `[Stripe Webhook] Released promo code for refunded booking ${booking.bookingNumber}`
    )
  }

  // 5. Handle Wallet Credit properly at cancellation time:
  const customerId = (booking.customer as any)?._id || booking.customer

  // A. Restore original platform credit if customer applied wallet credit on booking and not already restored
  if (booking.platformCreditApplied > 0) {
    const alreadyRestored = await WalletLedger.findOne({
      booking: (booking as any)._id,
      source: WALLET_SOURCE.BOOKING_ROLLBACK,
    })
    if (!alreadyRestored) {
      await walletServices.creditUserWallet({
        userId: customerId,
        amount: booking.platformCreditApplied,
        source: WALLET_SOURCE.BOOKING_ROLLBACK,
        bookingId: (booking as any)._id,
        bookingGroupId: booking.bookingGroupId,
        description: `Stripe cancellation refund for booking #${booking.bookingNumber} - original platform credit restored`,
      })
      logger.info(
        `[Stripe Webhook] Restored $${booking.platformCreditApplied} AUD platform credit for booking ${booking.bookingNumber}`
      )
    }
  }

  // B. Compensation for artist cancellation (Disabled per business requirement, kept commented for future use)
  /*
  if (booking.cancelledByRole === 'artist' || charge.metadata?.cancelledBy === 'artist') {
    const alreadyCompensated = await WalletLedger.findOne({
      booking: (booking as any)._id,
      source: WALLET_SOURCE.ARTIST_COMPENSATION,
    })
    if (!alreadyCompensated) {
      await walletServices.creditUserWallet({
        userId: customerId,
        amount: 15,
        source: WALLET_SOURCE.ARTIST_COMPENSATION,
        bookingId: (booking as any)._id,
        bookingGroupId: booking.bookingGroupId,
        description: `Compensation for artist cancellation on booking #${booking.bookingNumber}`,
      })
      logger.info(
        `[Stripe Webhook] Credited $15 AUD artist cancellation compensation to customer wallet for booking ${booking.bookingNumber}`
      )
    }
  }
  */

  // C. Artist Penalty Check (if cancelled by artist and not yet recorded):
  if (booking.cancelledByRole === 'artist' || charge.metadata?.cancelledBy === 'artist') {
    const alreadyPenalized = await Penalty.findOne({ booking: (booking as any)._id })
    if (!alreadyPenalized) {
      const artistId = (booking.artist as any)?._id || booking.artist
      const artistProfile = await ArtistProfile.findOne({ user: artistId })
      if (artistProfile) {
        artistProfile.cancelBookingCount = (artistProfile.cancelBookingCount || 0) + 1
        const platformSettings = await PlatformSettings.getSettings()
        const appointmentDateTime = moment(
          `${moment(booking.bookingDate).format('YYYY-MM-DD')} ${booking.startTime}`,
          'YYYY-MM-DD HH:mm'
        )
        const hoursUntilAppointment = appointmentDateTime.isValid()
          ? appointmentDateTime.diff(moment(), 'hours', true)
          : 0

        const penaltyCalc = calculateArtistCancellationPenalty(
          booking.totalBookingPrice || booking.grossAmount || 0,
          hoursUntilAppointment,
          platformSettings
        )

        if (penaltyCalc.penaltyAmount > 0) {
          artistProfile.isPenaltyRequired = true
          await Penalty.create({
            booking: (booking as any)._id,
            bookingNumber: booking.bookingNumber,
            customer: (booking.customer as any)?._id || booking.customer,
            artist: artistId,
            bookingAmount: booking.totalBookingPrice || booking.grossAmount || 0,
            budgetTier: penaltyCalc.budgetTier,
            timeframeTier: penaltyCalc.timeframeTier,
            penaltyAmount: penaltyCalc.penaltyAmount,
            currency: 'AUD',
            reason: 'Artist cancelled appointment (refunded via Stripe)',
            isPenaltyRequired: true,
            status: PENALTY_STATUS.PENDING,
            deductedFromWallet: false,
          })
          logger.warn(
            `[Stripe Webhook] Flagged artist ${artistId} with $${penaltyCalc.penaltyAmount} AUD penalty for refund on booking ${booking.bookingNumber}`
          )
        }
        await artistProfile.save()
      }
    }
  }

  // 6. Void or issue credit note for customer and artist Stripe invoices
  await bookingServices.voidOrCreditNoteInvoice(booking.stripeInvoiceId, booking.bookingNumber)
  await bookingServices.voidOrCreditNoteInvoice(
    booking.artistStripeInvoiceId,
    booking.bookingNumber
  )

  // 7. Update booking status if not already set
  if (!isAlreadyCancelled) {
    booking.status = BOOKING_STATUS.CANCELLED
    booking.cancelledAt = new Date()
    booking.cancellationReason = 'Refund completed via Stripe'
  }
  await booking.save()

  logger.info(
    `[Stripe Webhook] Successfully processed charge.refunded for booking ${booking.bookingNumber}`
  )
}

// Checkout Session Completed Event (e.g. Penalty Settlement paid directly on Stripe Checkout)
const handleCheckoutSessionCompleted = async (session: Stripe.Checkout.Session) => {
  const metadata = session.metadata || {}
  if (metadata.type === 'PENALTY_SETTLEMENT') {
    const penaltyId = metadata.penaltyId
    const artistId = metadata.artistId

    if (!penaltyId || !artistId) return

    const penalty = await Penalty.findById(penaltyId)
    if (penalty && penalty.status === PENALTY_STATUS.PENDING) {
      penalty.status = PENALTY_STATUS.PAID
      penalty.paidAt = new Date()
      penalty.stripeCheckoutSessionId = session.id
      if (session.payment_intent) {
        penalty.stripePaymentIntentId =
          typeof session.payment_intent === 'string'
            ? session.payment_intent
            : session.payment_intent.id
      }
      await penalty.save()
      logger.info(
        `[Stripe Webhook] Penalty ${penaltyId} paid via Stripe Checkout by artist ${artistId}`
      )

      // Create PaymentTransaction audit record for penalty settlement
      const paymentIntentId = penalty.stripePaymentIntentId || null
      const marketplaceFee = round2(penalty.penaltyAmount / 1.1)
      const marketplaceFeeGst = round2(penalty.penaltyAmount - marketplaceFee)

      const existingTxn = await PaymentTransaction.findOne({
        $or: [
          { transactionId: `TXN-${penalty.bookingNumber}-PENALTY` },
          ...(paymentIntentId ? [{ stripePaymentIntentId: paymentIntentId }] : []),
        ],
      })

      if (existingTxn) {
        existingTxn.status = PAYMENT_STATUS.SUCCEEDED
        if (paymentIntentId) existingTxn.stripePaymentIntentId = paymentIntentId
        await existingTxn.save()
      } else {
        await PaymentTransaction.create({
          transactionId: `TXN-${penalty.bookingNumber}-PENALTY`,
          booking: penalty.booking,
          bookingGroupId: `GRP-${penalty.bookingNumber}`,
          user: penalty.artist,
          artist: penalty.artist,
          type: PAYMENT_TRANSACTION_TYPE.PENALTY,
          gateway: PAYMENT_GATEWAY.STRIPE_CONNECT,
          status: PAYMENT_STATUS.SUCCEEDED,
          currency: penalty.currency || 'AUD',
          amount: penalty.penaltyAmount,
          platformCreditUsed: 0,
          marketplaceFee,
          marketplaceFeeGst,
          stripeFeeBorne: 0,
          artistNetShare: 0,
          stripePaymentIntentId: paymentIntentId,
        })
      }
      logger.info(
        `[Stripe Webhook] PaymentTransaction created for penalty #${penalty._id} on booking ${penalty.bookingNumber}`
      )

      // Check if artist has any remaining PENDING penalties
      const remainingPending = await Penalty.countDocuments({
        artist: artistId,
        status: PENALTY_STATUS.PENDING,
      })

      // If 0 remaining pending penalties, restore artist profile visibility and un-suspend account
      if (remainingPending === 0) {
        await Promise.all([
          ArtistProfile.findOneAndUpdate(
            { user: artistId },
            { $set: { isPenaltyRequired: false } }
          ),
          User.findOneAndUpdate(
            { _id: artistId, status: AuthStatus.SUSPENDED },
            { $set: { status: AuthStatus.ACTIVE } }
          ),
        ])
        logger.info(
          `[Stripe Webhook] All penalties cleared for artist ${artistId}. Artist profile re-enabled and account restored to ACTIVE.`
        )
      }
    }
  }
}

const listenStripeEventsForPlatformAccount = async (event: Stripe.Event) => {
  switch (event.type) {
    case 'payment_intent.succeeded':
      await handlePaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent)
      break
    case 'payment_intent.payment_failed':
      await handlePaymentIntentFailed(event.data.object as Stripe.PaymentIntent)
      break
    case 'payment_intent.canceled':
      await handlePaymentIntentCanceled(event.data.object as Stripe.PaymentIntent)
      break
    case 'charge.refunded':
      await handleChargeRefunded(event.data.object as Stripe.Charge)
      break
    case 'invoice.payment_succeeded':
      await handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice)
      break
    case 'checkout.session.completed':
      await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session)
      break
    default:
      logger.info(`[Stripe Webhook] Unhandled event type: ${event.type}`)
  }

  return { received: true }
}

const listenStripeEventsForConnectedAccount = async (event: Stripe.Event) => {
  switch (event.type) {
    case 'account.updated':
      await handleAccountUpdated(event)
      break
    default:
      logger.info(`[Stripe Webhook] Unhandled event type: ${event.type}`)
  }

  return { received: true }
}

export const stripeServices = {
  listenStripeEventsForPlatformAccount,
  listenStripeEventsForConnectedAccount,
}
