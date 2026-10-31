import { notificationServices } from '../Notification/notification.services'
import {
  Account,
  Address,
  ArtistBlockedDate,
  ArtistProfile,
  ArtistServices,
  AuthStatus,
  Availability,
  Booking,
  BOOKING_STATUS,
  NOTIFICATION_TYPE,
  BookingHistory,
  BOOKING_TIMELINE_MILESTONE,
  PaymentMethod,
  PaymentTransaction,
  PAYMENT_GATEWAY,
  PAYMENT_STAGE_STATUS,
  PAYMENT_STATUS,
  PAYMENT_TRANSACTION_TYPE,
  Penalty,
  PENALTY_STATUS,
  PlatformSettings,
  PromoCode,
  Review,
  User,
  WalletLedger,
  WALLET_SOURCE,
  type IUser,
} from '@repo/db'
import { AppError } from '@repo/shared'
import { stripe, getOrCreateStripeGstTaxRate } from '@app/libs/stripe'
import configs from '@app/configs'
import { logger } from '@app/libs/logger'
import Stripe from 'stripe'
import mongoose from 'mongoose'
import httpStatus from 'http-status'
import moment from 'moment'
import { walletServices } from '../Wallet/wallet.services'
import { uploadMultipleFileToS3 } from 'packages/media-hub/src'
import { AWS_FOLDER_NAMES } from '@app/libs/files_folder'
import {
  calculateBookingBreakdown,
  calculateArtistCancellationPenalty,
  calculateDistanceKm,
  round2,
} from './booking.utils'
import {
  generateBookingTaxInvoice,
  generateBalancePaymentReceipt,
  generateArtistRctiInvoice,
} from './booking.invoice.utils'

export interface ICreateBookingInput {
  artist: string
  services: string[]
  visitType: 'home_visit' | 'salon_visit'
  address?: string
  bookingDate: string // YYYY-MM-DD
  startTime: string // HH:mm
  guestCount: number
  promoCode?: string
  usePlatformCredit?: boolean
  paymentMethodId?: string
}

export interface ICheckoutPreviewInput {
  artist: string
  services: string[]
  guestCount: number
  visitType?: 'home_visit' | 'salon_visit'
  address?: string
  promoCode?: string
  usePlatformCredit?: boolean
}

/**
 * Extracts and deduplicates service IDs from input services array
 */
const extractServiceIds = (services: string[] = []): string[] => {
  if (!Array.isArray(services)) return []
  return Array.from(new Set(services.map((s) => String(s).trim()).filter(Boolean)))
}

/**
 * Generates a human-friendly unique booking number: BK-YYMM-XXXX
 */
const generateBookingNumber = (): string => {
  const datePart = moment().format('YYMM')
  const randomPart = Math.random().toString(36).substring(2, 6).toUpperCase()
  return `BK-${datePart}-${randomPart}`
}

/**
 * Preview financial breakdown before booking confirmation
 */
const checkoutPreview = async (user: IUser, input: ICheckoutPreviewInput) => {
  const serviceIds = extractServiceIds(input.services)
  if (serviceIds.length === 0) {
    throw new AppError(httpStatus.BAD_REQUEST, 'At least one service must be selected')
  }

  const services = await ArtistServices.find({ _id: { $in: serviceIds }, isActive: true })
  if (services.length !== serviceIds.length) {
    throw new AppError(httpStatus.NOT_FOUND, 'One or more selected services are unavailable or inactive')
  }

  for (const s of services) {
    if (s.artist.toString() !== input.artist.toString()) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        `Selected service '${s.name}' does not belong to this artist`
      )
    }
  }

  if (user._id.toString() === input.artist.toString()) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'You cannot book your own service'
    )
  }

  const artistProfile = await ArtistProfile.findOne({ user: input.artist })
  if (!artistProfile) {
    throw new AppError(httpStatus.NOT_FOUND, 'Artist profile not found')
  }

  if (artistProfile.isPenaltyRequired) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      'This artist is currently unavailable for new bookings.'
    )
  }

  const artistUser = await User.findById(input.artist)
  if (
    !artistUser ||
    artistUser.status !== AuthStatus.ACTIVE ||
    !artistUser.isProfileCompleted ||
    !artistUser.isStripeConnected
  ) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'This artist cannot accept bookings as their profile or payment onboarding is incomplete.'
    )
  }

  const guestCount = Math.max(1, Number(input.guestCount) || 1)
  const totalServicePrice = round2(
    services.reduce((acc, s) => acc + (s.price || 0) * guestCount, 0)
  )
  const totalDuration = services.reduce(
    (acc, s) => acc + (s.durationMinutes || 60) * guestCount,
    0
  )

  const platformSettings = await PlatformSettings.getSettings()
  const platformCommissionPercent = platformSettings?.platformPercentage ?? 20
  const gstPercent = platformSettings?.gstPercentage ?? 10
  const stripeGstTaxRateId = platformSettings?.stripeGstTaxRateId || null
  const travelingFeePerKm = platformSettings?.travelingFeePerKm ?? 0

  let travelFee = 0
  let distanceKm = 0
  const visitType = input.visitType || 'home_visit'
  let addressDoc: any = null

  if (input.address) {
    if (!mongoose.isValidObjectId(input.address)) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Invalid address ID format')
    }
    const foundAddress = await Address.findById(input.address)
    if (!foundAddress) {
      throw new AppError(
        httpStatus.NOT_FOUND,
        'Customer address is not listed in the database. Please provide a valid saved address.'
      )
    }
    if (foundAddress.customer.toString() !== user._id.toString()) {
      throw new AppError(
        httpStatus.FORBIDDEN,
        'Selected address is not listed under your account.'
      )
    }
    addressDoc = foundAddress
  }

  if (visitType === 'home_visit') {
    if (!input.address || !addressDoc) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'Customer address is required for home visits to calculate travel fee'
      )
    }

    if (!addressDoc.location?.coordinates) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'Customer address is missing location coordinates'
      )
    }

    if (!artistProfile.location?.coordinates) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'Artist location coordinates not configured on profile'
      )
    }

    distanceKm = calculateDistanceKm(
      artistProfile.location.coordinates as [number, number],
      addressDoc.location.coordinates as [number, number]
    )

    const artistMaxRadius = artistProfile.travelRadius || 0
    if (artistMaxRadius > 0 && distanceKm > artistMaxRadius) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        `Selected address is outside this artist's travel radius (${artistMaxRadius} km). Current distance: ${distanceKm} km.`
      )
    }

    travelFee = round2(distanceKm * travelingFeePerKm)
  }

  // Promo code
  let promoDoc = null
  if (input.promoCode) {
    promoDoc = await PromoCode.findOne({
      promoCode: input.promoCode.toUpperCase().trim(),
    })
  }

  // Wallet balance
  const wallet = await walletServices.getMyWallet(user._id)

  const breakdown = calculateBookingBreakdown({
    servicePrice: totalServicePrice,
    travelFee,
    parkingFee: 0,
    isArtistGstRegistered: artistProfile.isGstRegistered,
    promoCode: promoDoc,
    usePlatformCredit: Boolean(input.usePlatformCredit),
    availableWalletCredit: wallet.balance,
    platformCommissionPercent,
    gstPercent,
  })

  return {
    service: {
      id: services[0]?._id,
      name: services.map((s) => s.name).join(', '),
      unitPrice: services[0]?.price,
      guestCount,
      totalServicePrice,
      durationMinutes: totalDuration,
    },
    services: services.map((s) => ({
      id: s._id,
      name: s.name,
      unitPrice: s.price,
      guestCount,
      totalServicePrice: round2((s.price || 0) * guestCount),
      durationMinutes: (s.durationMinutes || 60) * guestCount,
    })),
    travel: {
      visitType,
      distanceKm,
      travelFee,
      parkingFee: 0,
    },
    artist: {
      id: input.artist,
      businessName: artistProfile.businessName,
      isGstRegistered: artistProfile.isGstRegistered,
      travelRadius: artistProfile.travelRadius,
    },
    taxConfig: {
      gstPercentage: gstPercent,
      stripeGstTaxRateId,
    },
    walletBalance: wallet.balance,
    breakdown,
  }
}

/**
 * Create a new booking, apply promo/wallet, charge 20% deposit and vault card
 */
const createBooking = async (user: IUser, input: ICreateBookingInput) => {
  const serviceIds = extractServiceIds(input.services)
  if (serviceIds.length === 0) {
    throw new AppError(httpStatus.BAD_REQUEST, 'At least one service must be selected')
  }

  const services = await ArtistServices.find({ _id: { $in: serviceIds }, isActive: true })
  if (services.length !== serviceIds.length) {
    throw new AppError(
      httpStatus.NOT_FOUND,
      'One or more selected services are unavailable or inactive'
    )
  }

  for (const s of services) {
    if (s.artist.toString() !== input.artist.toString()) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        `Selected service '${s.name}' does not belong to this artist`
      )
    }
  }

  if (user._id.toString() === input.artist.toString()) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'You cannot book your own service'
    )
  }

  const artistProfile = await ArtistProfile.findOne({ user: input.artist })
  if (!artistProfile) {
    throw new AppError(httpStatus.NOT_FOUND, 'Artist profile not found')
  }

  if (artistProfile.isPenaltyRequired) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      'This artist is currently unavailable for new bookings.'
    )
  }

  const artistUser = await User.findById(input.artist)
  if (
    !artistUser ||
    artistUser.status !== AuthStatus.ACTIVE ||
    !artistUser.isProfileCompleted ||
    !artistUser.isStripeConnected
  ) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'This artist cannot accept bookings as their profile or payment onboarding is incomplete.'
    )
  }

  const guestCount = Math.max(1, Number(input.guestCount) || 1)
  const totalServicePrice = round2(
    services.reduce((acc, s) => acc + (s.price || 0) * guestCount, 0)
  )

  // 1. Calculate appointment end time (duration multiplied by guest count across all services)
  const duration = services.reduce(
    (acc, s) => acc + (s.durationMinutes || 60) * guestCount,
    0
  )
  const startMoment = moment(`${input.bookingDate} ${input.startTime.trim()}`, [
    'YYYY-MM-DD HH:mm',
    'YYYY-MM-DD hh:mm A',
    'YYYY-MM-DD h:mm A',
    'YYYY-MM-DD hh:mma',
    'YYYY-MM-DD h:mma',
  ])
  if (!startMoment.isValid() || startMoment.isBefore(moment())) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Booking date and time must be in the future')
  }
  const normalizedStartTime = startMoment.format('HH:mm')
  const endMoment = startMoment.clone().add(duration, 'minutes')
  const endTime = endMoment.format('HH:mm')
  const appointmentDate = startMoment.clone().startOf('day').toDate()

  // 2. Check artist schedule settings (minNotice, maxBookingPerDay, isQuickBookingEnabled)
  const availability = await Availability.findOne({ user: input.artist })
  if (availability) {
    const minNoticeHours = availability.minNotice || 0
    if (minNoticeHours > 0 && startMoment.isBefore(moment().add(minNoticeHours, 'hours'))) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        `This artist requires at least ${minNoticeHours} hours advance notice for appointments.`
      )
    }

    if (availability.maxBookingPerDay) {
      const dailyCount = await Booking.countDocuments({
        artist: input.artist,
        bookingDate: appointmentDate,
        status: {
          $nin: [BOOKING_STATUS.CANCELLED, BOOKING_STATUS.DECLINED],
        },
      })
      if (dailyCount >= availability.maxBookingPerDay) {
        throw new AppError(
          httpStatus.CONFLICT,
          `This artist has reached the maximum booking limit for this day (${availability.maxBookingPerDay} bookings).`
        )
      }
    }
  }

  const isQuickBooking = Boolean(availability?.isQuickBookingEnabled)

  // 3. Check for double booking conflicts on the artist schedule
  const existingConflict = await Booking.findOne({
    artist: input.artist,
    bookingDate: appointmentDate,
    status: {
      $nin: [BOOKING_STATUS.CANCELLED, BOOKING_STATUS.DECLINED],
    },
    $or: [
      {
        startTime: { $lt: endTime },
        endTime: { $gt: normalizedStartTime },
      },
    ],
  })

  if (existingConflict) {
    throw new AppError(
      httpStatus.CONFLICT,
      'This artist is already booked for the selected time slot. Please choose another time.'
    )
  }

  // 4. Address & Travel Distance Calculation
  let travelFee = 0
  let distanceKm = 0
  let addressDoc: any = null
  let serviceLocationSnapshot: any = null

  if (input.address) {
    if (!mongoose.isValidObjectId(input.address)) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Invalid address ID format')
    }
    const foundAddress = await Address.findById(input.address)
    if (!foundAddress) {
      throw new AppError(
        httpStatus.NOT_FOUND,
        'Customer address is not listed in the database. Please provide a valid saved address.'
      )
    }
    if (foundAddress.customer.toString() !== user._id.toString()) {
      throw new AppError(
        httpStatus.FORBIDDEN,
        'Selected address is not listed under your account.'
      )
    }
    addressDoc = foundAddress
    serviceLocationSnapshot = {
      address: addressDoc.address,
      suburb: addressDoc.city || '',
      state: addressDoc.state || '',
      postalCode: addressDoc.postalCode || '',
      coordinates: addressDoc.location?.coordinates,
    }
  }

  if (input.visitType === 'home_visit') {
    if (!input.address || !addressDoc) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'Customer address is required for home visits to calculate travel fee'
      )
    }

    if (!addressDoc.location?.coordinates) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'Customer address is missing location coordinates'
      )
    }

    if (!artistProfile.location?.coordinates) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'Artist location coordinates not configured on profile'
      )
    }

    distanceKm = calculateDistanceKm(
      artistProfile.location.coordinates as [number, number],
      addressDoc.location.coordinates as [number, number]
    )

    const artistMaxRadius = artistProfile.travelRadius || 0
    if (artistMaxRadius > 0 && distanceKm > artistMaxRadius) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        `Selected address is outside this artist's travel radius (${artistMaxRadius} km). Current distance: ${distanceKm} km.`
      )
    }

    const platformSettings = await PlatformSettings.getSettings()
    travelFee = round2(distanceKm * (platformSettings?.travelingFeePerKm || 0))
  }

  // 5. Promo Code check
  let promoDoc = null
  if (input.promoCode) {
    promoDoc = await PromoCode.findOne({
      promoCode: input.promoCode.toUpperCase().trim(),
    })
    if (!promoDoc) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Invalid promo code')
    }
  }

  // 6. Wallet platform credit check
  const wallet = await walletServices.getMyWallet(user._id)

  const platformSettings = await PlatformSettings.getSettings()
  const platformCommissionPercent = platformSettings?.platformPercentage ?? 20
  const gstPercent = platformSettings?.gstPercentage ?? 10

  let stripeGstTaxRateId = platformSettings?.stripeGstTaxRateId
  if (!stripeGstTaxRateId) {
    try {
      const taxRate = await getOrCreateStripeGstTaxRate(gstPercent)
      stripeGstTaxRateId = taxRate.id
      if (platformSettings) {
        platformSettings.stripeGstTaxRateId = taxRate.id
        await platformSettings.save()
      }
    } catch (taxErr: any) {
      // Fallback
    }
  }

  // 7. Calculate Financial Breakdown
  const breakdown = calculateBookingBreakdown({
    servicePrice: totalServicePrice,
    travelFee,
    parkingFee: 0,
    isArtistGstRegistered: artistProfile.isGstRegistered,
    promoCode: promoDoc,
    usePlatformCredit: Boolean(input.usePlatformCredit),
    availableWalletCredit: wallet.balance,
    platformCommissionPercent,
    gstPercent,
  })

  const bookingNumber = generateBookingNumber()
  const bookingGroupId = `GRP-${bookingNumber}`
  const balanceDueDate = startMoment.clone().subtract(24, 'hours').toDate()

  let stripePaymentIntentId: string | undefined
  let clientSecret: string | undefined
  let initialStatus: 'pending' | 'captured' = 'pending'
  let bookingStatus: string = BOOKING_STATUS.REQUESTED
  let stripeInvoiceId: string | null = null
  let stripeInvoiceUrl: string | null = null
  let stripeInvoicePdf: string | null = null
  let effectivePaymentMethodId: string | undefined

  // 8. Validate and retrieve customer payment method
  if (input.paymentMethodId) {
    const existingCard = await PaymentMethod.findOne(
      mongoose.isValidObjectId(input.paymentMethodId)
        ? { _id: input.paymentMethodId }
        : { stripePaymentMethodId: input.paymentMethodId }
    )
    if (!existingCard) {
      throw new AppError(
        httpStatus.NOT_FOUND,
        'Payment method is not listed in the database. Please provide a valid saved payment method.'
      )
    }
    if (existingCard.user.toString() !== user._id.toString()) {
      throw new AppError(
        httpStatus.FORBIDDEN,
        'Selected payment method is not listed under your account.'
      )
    }
    effectivePaymentMethodId = existingCard.stripePaymentMethodId
  }

  if (isQuickBooking) {
    // 7. Verify Stripe customer exists
    if (!user.stripeCustomerId) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'Stripe customer not found. Please setup a payment method first.'
      )
    }
    const stripeCustomerId = user.stripeCustomerId

    if (breakdown.initialDepositAmount > 0 && !effectivePaymentMethodId) {
      const defaultCard = await PaymentMethod.findOne({ user: user._id, isDefault: true })
      if (!defaultCard) {
        throw new AppError(
          httpStatus.BAD_REQUEST,
          'Payment method required for quick booking deposit.'
        )
      }
      effectivePaymentMethodId = defaultCard.stripePaymentMethodId
    }

    // Debit wallet credit if applied
    if (breakdown.platformCreditApplied > 0) {
      await walletServices.debitUserWallet({
        userId: user._id,
        amount: breakdown.platformCreditApplied,
        source: WALLET_SOURCE.BOOKING_PAYMENT,
        bookingGroupId,
        description: `Platform credit applied to booking #${bookingNumber}`,
      })
    }

    // 9. 20% Deposit Stripe Payment Intent
    if (breakdown.initialDepositAmount > 0 && effectivePaymentMethodId) {
      try {
        const piParams: Stripe.PaymentIntentCreateParams = {
          amount: Math.round(breakdown.initialDepositAmount * 100), // in cents
          currency: 'aud',
          customer: stripeCustomerId,
          payment_method: effectivePaymentMethodId,
          confirm: true, // Attempt capture immediately
          off_session: true, // Card is pre-vaulted and authorized
          automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
          transfer_group: bookingGroupId,
          metadata: {
            bookingNumber,
            bookingGroupId,
            userId: user._id.toString(),
            artistId: input.artist,
            type: PAYMENT_TRANSACTION_TYPE.INITIAL_20,
            gstPercentage: gstPercent.toString(),
            gstAmount: breakdown.serviceGst.toString(),
            stripeGstTaxRateId: stripeGstTaxRateId || '',
          },
        }

        const paymentIntent = await stripe.paymentIntents.create(piParams)

        stripePaymentIntentId = paymentIntent.id
        clientSecret = paymentIntent.client_secret || undefined

        if (paymentIntent.status === 'succeeded') {
          initialStatus = 'captured'
          bookingStatus = BOOKING_STATUS.CONFIRMED
        }
      } catch (paymentErr: any) {
        if (breakdown.platformCreditApplied > 0) {
          await walletServices.rollbackDebit(
            user._id,
            breakdown.platformCreditApplied,
            undefined,
            'Initial deposit payment failed - credit reversed'
          )
        }
        throw new AppError(
          httpStatus.BAD_REQUEST,
          `Payment failed: ${paymentErr?.message || 'Card declined'}`
        )
      }
    } else {
      // Booking is fully covered by promo or platform credit
      initialStatus = 'captured'
      bookingStatus = BOOKING_STATUS.CONFIRMED
    }
  } else {
    // Quick booking disabled: Customer places booking request; no charge executed yet.
    if (!effectivePaymentMethodId) {
      const defaultCard = await PaymentMethod.findOne({ user: user._id, isDefault: true })
      if (defaultCard) {
        effectivePaymentMethodId = defaultCard.stripePaymentMethodId
      }
    }
    bookingStatus = BOOKING_STATUS.REQUESTED
  }

  // 11. Increment promo code usage if applied (only for immediately captured bookings)
  if (promoDoc && breakdown.discountAmount > 0 && initialStatus === 'captured') {
    await PromoCode.findByIdAndUpdate(promoDoc._id, { $inc: { usageCount: 1 } })
  }

  // 12. Create Booking Document
  const booking = await Booking.create({
    bookingNumber,
    bookingGroupId,
    customer: user._id,
    artist: input.artist,
    service: new mongoose.Types.ObjectId(serviceIds[0]),
    services: serviceIds.map((id) => new mongoose.Types.ObjectId(id)),
    visitType: input.visitType,
    address: input.address,
    serviceLocationSnapshot: serviceLocationSnapshot || undefined,
    bookingDate: appointmentDate,
    startTime: normalizedStartTime,
    endTime,
    durationMinutes: duration,
    guestCount,
    status: bookingStatus,
    isQuickBooking,
    servicePrice: breakdown.servicePrice,
    travelFee: breakdown.travelFee,
    parkingFee: breakdown.parkingFee,
    grossAmount: breakdown.grossAmount,
    discountAmount: breakdown.discountAmount,
    platformCreditApplied: initialStatus === 'captured' ? breakdown.platformCreditApplied : 0,
    gstAmount: breakdown.serviceGst,
    stripeGstTaxRateId: stripeGstTaxRateId || null,
    totalBookingPrice: breakdown.totalBookingPrice,
    initialPayment: {
      percentage: 20,
      amount: breakdown.initialDepositAmount,
      status: initialStatus,
      stripePaymentIntentId: stripePaymentIntentId || null,
      paidAt: initialStatus === 'captured' ? new Date() : null,
    },
    balancePayment: {
      percentage: 80,
      amount: breakdown.balanceDueAmount,
      dueDate: balanceDueDate,
      status:
        breakdown.balanceDueAmount === 0
          ? PAYMENT_STAGE_STATUS.CAPTURED
          : PAYMENT_STAGE_STATUS.PENDING,
      paidAt: breakdown.balanceDueAmount === 0 ? new Date() : null,
    },
    stripeCustomerId: user.stripeCustomerId || null,
    stripePaymentMethodId: effectivePaymentMethodId || null,
    platformCommissionPercentage: breakdown.platformCommissionPercentage,
    platformCommissionAmount: breakdown.platformCommissionAmount,
    platformCommissionGst: breakdown.platformCommissionGst,
    stripeInitialFee: breakdown.stripeInitialFee,
    stripeBalanceFee: breakdown.stripeBalanceFee,
    artistNetPayout: breakdown.artistNetPayout,
    promoCode: promoDoc?._id || null,
    promoCodeText: promoDoc?.promoCode || null,
  })

  // 13. Issue official Stripe Tax Invoice ONLY after payment succeeds
  if (initialStatus === 'captured') {
    await issueCustomerStripeInvoice(booking)
  }

  // 13. Create PaymentTransaction audit record if payment occurred
  if (
    initialStatus === 'captured' &&
    (breakdown.initialDepositAmount > 0 || breakdown.platformCreditApplied > 0)
  ) {
    const txnPayload: any = {
      transactionId: `TXN-${bookingNumber}-01`,
      booking: (booking as any)._id,
      bookingGroupId,
      user: (user as any)._id,
      artist: input.artist,
      type: PAYMENT_TRANSACTION_TYPE.INITIAL_20,
      gateway:
        breakdown.platformCreditApplied > 0
          ? PAYMENT_GATEWAY.MIXED
          : PAYMENT_GATEWAY.STRIPE_CONNECT,
      status: PAYMENT_STATUS.SUCCEEDED,
      currency: 'AUD',
      amount: breakdown.initialDepositAmount,
      platformCreditUsed: breakdown.platformCreditApplied,
      marketplaceFee: breakdown.platformCommissionAmount,
      marketplaceFeeGst: breakdown.platformCommissionGst,
      stripeFeeBorne: breakdown.stripeInitialFee,
      artistNetShare: 0, // Artist gets payout upon 80% & completion
    }
    if (stripePaymentIntentId) {
      txnPayload.stripePaymentIntentId = stripePaymentIntentId
    }
    await PaymentTransaction.create(txnPayload)
  }

  // Record BookingHistory
  await recordBookingHistory({
    booking: (booking as any)._id,
    bookingNumber: booking.bookingNumber,
    status: booking.status,
    milestone: BOOKING_TIMELINE_MILESTONE.BOOKING_CREATED,
    title: 'Booking Created',
    description: 'Booking was submitted by the customer',
    performedBy: user._id,
    performedByRole: 'customer',
  })

  if (initialStatus === 'captured') {
    await recordBookingHistory({
      booking: (booking as any)._id,
      bookingNumber: booking.bookingNumber,
      status: booking.status,
      milestone: BOOKING_TIMELINE_MILESTONE.PAYMENT_COMPLETED,
      title: 'Payment Completed',
      description: `Initial 20% deposit of $${breakdown.initialDepositAmount} AUD captured successfully`,
      performedBy: user._id,
      performedByRole: 'customer',
      metadata: { stripePaymentIntentId },
    })
  }

  // Notify artist of incoming request
  try {
    await notificationServices.sendNotification({
      recipient: booking.artist,
      sender: user._id,
      senderName: user.name,
      senderPicture: user.profileImage,
      title: 'New Booking Request',
      message: `${user.name} has requested a new booking #${booking.bookingNumber}`,
      type: NOTIFICATION_TYPE.BOOKING_REQUESTED,
      bookingId: booking._id,
      bookingNumber: booking.bookingNumber,
      actionUrl: `/bookings/${booking._id}`,
    })
  } catch (notifErr) {
    logger.warn('[Booking Notification] Failed to notify artist:', notifErr)
  }

  return {
    booking,
    clientSecret,
    breakdown,
  }
}

const voidOrCreditNoteInvoice = async (
  invoiceId: string | null | undefined,
  bookingNumber: string
) => {
  if (!invoiceId) return
  let customerIdToClear: string | null = null
  try {
    const voided = await stripe.invoices.voidInvoice(invoiceId)
    customerIdToClear =
      typeof voided.customer === 'string' ? voided.customer : voided.customer?.id || null
  } catch (voidErr: any) {
    // If invoice was already marked paid or cannot be voided, issue Credit Note for legal cancellation
    try {
      const cn = await stripe.creditNotes.create({
        invoice: invoiceId,
        reason: 'order_cancellation',
        memo: `Cancelled booking #${bookingNumber}`,
      })
      customerIdToClear =
        typeof cn.customer === 'string' ? cn.customer : cn.customer?.id || null
    } catch (cnErr: any) {
      logger.warn(`Failed to void or credit-note invoice ${invoiceId}: ${cnErr?.message}`)
    }
  }

  // Ensure voided/credited invoice does not leave orphan credit balance on the Stripe customer
  if (customerIdToClear) {
    try {
      const cust = await stripe.customers.retrieve(customerIdToClear)
      if (!cust.deleted && typeof cust.balance === 'number' && cust.balance < 0) {
        await stripe.customers.createBalanceTransaction(customerIdToClear, {
          amount: -cust.balance,
          currency: 'aud',
          description: `Clear residual credit balance from cancelled booking #${bookingNumber}`,
        })
      }
    } catch {
      // safe fallback
    }
  }
}

/**
 * Cancel Booking adhering to the 24h refund / forfeiture policy
 */
/**
 * Customer specific cancellation service
 */
const customerCancelBooking = async (
  user: IUser,
  bookingId: string,
  cancellationReason?: string
) => {
  const booking = await Booking.findById(bookingId).populate('artist customer')
  if (!booking) {
    throw new AppError(httpStatus.NOT_FOUND, 'Booking not found')
  }

  const isCustomer = booking.customer._id.toString() === user._id.toString()
  const isAdmin = user.role === 'admin' || user.role === 'super_admin'
  if (!isCustomer && !isAdmin) {
    throw new AppError(httpStatus.FORBIDDEN, 'Only the customer can cancel this booking')
  }

  if (
    booking.status === BOOKING_STATUS.CANCELLED ||
    booking.status === BOOKING_STATUS.COMPLETED ||
    booking.status === BOOKING_STATUS.DECLINED ||
    booking.status === BOOKING_STATUS.NO_SHOW
  ) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `Cannot cancel booking that is already '${booking.status}'`
    )
  }

  const appointmentDateStr = moment.utc(booking.bookingDate).format('YYYY-MM-DD')
  const appointmentDateTime = moment(
    `${appointmentDateStr} ${booking.startTime}`,
    'YYYY-MM-DD HH:mm'
  )
  const hoursUntilAppointment = appointmentDateTime.diff(moment(), 'hours', true)

  const isInitialPaid = booking.initialPayment.status === PAYMENT_STAGE_STATUS.CAPTURED
  const isBalancePaid =
    booking.balancePayment.status === PAYMENT_STAGE_STATUS.CAPTURED &&
    (booking.balancePayment.amount || 0) > 0

  // Release promo code if applied and deposit was captured
  if (booking.promoCode && isInitialPaid) {
    await PromoCode.findByIdAndUpdate(booking.promoCode, { $inc: { usageCount: -1 } })
  }

  // Void customer Stripe invoice or issue Credit Note if already finalized/paid
  await voidOrCreditNoteInvoice(booking.stripeInvoiceId, booking.bookingNumber)
  if (booking.artistStripeInvoiceId) {
    await voidOrCreditNoteInvoice(booking.artistStripeInvoiceId, booking.bookingNumber)
  }

  // Scenario A: Customer cancels > 24 hours prior (Point 1 & 2)
  if (hoursUntilAppointment > 24) {
    const depositPaid = isInitialPaid ? (booking.initialPayment.amount || 0) : 0
    const initialFee = isInitialPaid ? (booking.stripeInitialFee || 0) : 0

    const balancePaid = isBalancePaid ? (booking.balancePayment.amount || 0) : 0
    const balanceFee = isBalancePaid ? (booking.stripeBalanceFee || 0) : 0

    const totalPaid = round2(depositPaid + balancePaid)
    const totalFee = round2(initialFee + balanceFee)
    const refundCreditAmount = round2(Math.max(0, totalPaid - totalFee))

    // Issue Platform Credit to wallet (Valid for 36 months) after reducing Stripe processing fee
    if (refundCreditAmount > 0) {
      const alreadyCredited = await WalletLedger.findOne({
        booking: booking._id,
        source: WALLET_SOURCE.CANCELLATION_CREDIT,
      })
      if (!alreadyCredited) {
        const description = isBalancePaid
          ? `Booking #${booking.bookingNumber} cancellation credit (>24h policy, 100% payment $${totalPaid} minus Stripe processing fee $${totalFee})`
          : `Booking #${booking.bookingNumber} cancellation credit (>24h policy, 20% deposit $${depositPaid} minus Stripe processing fee $${initialFee})`

        await walletServices.creditUserWallet({
          userId: booking.customer._id,
          amount: refundCreditAmount,
          source: WALLET_SOURCE.CANCELLATION_CREDIT,
          bookingId: booking._id,
          bookingGroupId: booking.bookingGroupId,
          description,
        })
      }
    }

    // Restore original platform credit if applied
    if (booking.platformCreditApplied > 0) {
      const alreadyRestored = await WalletLedger.findOne({
        booking: booking._id,
        source: WALLET_SOURCE.BOOKING_ROLLBACK,
      })
      if (!alreadyRestored) {
        await walletServices.creditUserWallet({
          userId: booking.customer._id,
          amount: booking.platformCreditApplied,
          source: WALLET_SOURCE.BOOKING_ROLLBACK,
          bookingId: booking._id,
          bookingGroupId: booking.bookingGroupId,
          description: `Booking #${booking.bookingNumber} cancellation (>24h) - platform credit restored`,
        })
      }
    }

    booking.status = BOOKING_STATUS.CANCELLED
    booking.cancelledBy = user._id
    booking.cancelledByRole = isAdmin && !isCustomer ? 'admin' : 'customer'
    booking.cancellationReason = cancellationReason || 'Cancelled by customer >24h'
    booking.cancelledAt = new Date()
    booking.platformCreditIssued = refundCreditAmount
    if (isInitialPaid) {
      booking.initialPayment.status = PAYMENT_STAGE_STATUS.REFUNDED
    }
    if (isBalancePaid) {
      booking.balancePayment.status = PAYMENT_STAGE_STATUS.REFUNDED
    }
    await booking.save()

    let message = 'Booking cancelled successfully. No payment was charged.'
    if (isBalancePaid && totalPaid > 0) {
      message = `Booking cancelled successfully. Your 100% payment ($${totalPaid}) minus Stripe processing fee ($${totalFee}) has been credited to your wallet as $${refundCreditAmount} Platform Credit (valid 36 months).`
    } else if (isInitialPaid && depositPaid > 0) {
      message = `Booking cancelled successfully. Your 20% deposit ($${depositPaid}) minus Stripe processing fee ($${initialFee}) has been credited to your wallet as $${refundCreditAmount} Platform Credit (valid 36 months).`
    } else if (booking.platformCreditApplied > 0) {
      message = `Booking cancelled successfully. Your applied Platform Credit ($${booking.platformCreditApplied}) has been restored to your wallet.`
    }

    await recordBookingHistory({
      booking: booking._id,
      bookingNumber: booking.bookingNumber,
      status: BOOKING_STATUS.CANCELLED,
      milestone: BOOKING_TIMELINE_MILESTONE.CANCELLED,
      title: 'Booking Cancelled',
      description: message,
      performedBy: user._id,
      performedByRole: booking.cancelledByRole,
      note: booking.cancellationReason,
    })

    return {
      message,
      booking,
    }
  }

  // Scenario B: Customer cancels within 24 hours (< 24h) (Point 3)
  let customerCreditAmount = 0
  let artistShareAmount = 0

  if (isBalancePaid) {
    // Platform keeps the original 20% deposit
    // Customer gets 50% of artist net payout (40% of total booking) as Platform Credit
    // Artist gets 50% of artist net payout (40% of total booking) transferred to their Stripe account
    const baseNetPayout = booking.artistNetPayout
    customerCreditAmount = round2(baseNetPayout * 0.5)
    artistShareAmount = round2(baseNetPayout - customerCreditAmount)

    if (customerCreditAmount > 0) {
      const alreadyCredited = await WalletLedger.findOne({
        booking: booking._id,
        source: WALLET_SOURCE.CANCELLATION_CREDIT,
      })
      if (!alreadyCredited) {
        await walletServices.creditUserWallet({
          userId: booking.customer._id,
          amount: customerCreditAmount,
          source: WALLET_SOURCE.CANCELLATION_CREDIT,
          bookingId: booking._id,
          bookingGroupId: booking.bookingGroupId,
          description: `Booking #${booking.bookingNumber} late cancellation credit (50% of artist net payout)`,
        })
      }
    }

    let isTransferSuccessful = false
    let stripeTransferId: string | undefined
    let transferFailureReason: string | undefined
    const artistAccount = await Account.findOne({ user: booking.artist._id })
    if (artistAccount?.account && artistShareAmount > 0) {
      try {
        const transfer = await stripe.transfers.create({
          amount: Math.round(artistShareAmount * 100),
          currency: 'aud',
          destination: artistAccount.account,
          transfer_group: `GRP-${booking.bookingNumber}`,
          metadata: {
            bookingId: booking._id.toString(),
            type: 'LATE_CANCELLATION_ARTIST_SHARE',
          },
        })
        isTransferSuccessful = true
        stripeTransferId = transfer.id
      } catch (err: any) {
        if (err?.message?.includes('service agreement') && configs.nodeEnv !== 'production') {
          isTransferSuccessful = true
          logger.warn(
            `[Late Cancel Payout Sandbox Bypass] Cross-border US->AU transfer skipped in ${configs.nodeEnv} mode (${err.message}). Marked as transferred for testing.`
          )
        } else {
          transferFailureReason = err?.message || 'Artist payout transfer pending available balance'
          logger.warn(
            `[Late Cancel Payout Queued] Transfer pending for booking ${booking.bookingNumber}: ${transferFailureReason}`
          )
        }
      }
    } else if (artistShareAmount > 0) {
      transferFailureReason = 'Artist Stripe Connected Account not found'
    }

    const lateCancelTxnId = `TXN-${booking.bookingNumber}-LATE-CANCEL`
    await PaymentTransaction.findOneAndUpdate(
      { transactionId: lateCancelTxnId },
      {
        $set: {
          status: isTransferSuccessful ? PAYMENT_STATUS.SUCCEEDED : PAYMENT_STATUS.PENDING,
          ...(stripeTransferId ? { stripeTransferId } : {}),
          failureReason: isTransferSuccessful ? null : transferFailureReason,
          artistNetShare: artistShareAmount,
        },
        $setOnInsert: {
          transactionId: lateCancelTxnId,
          booking: booking._id,
          bookingGroupId: `GRP-${booking.bookingNumber}`,
          user: booking.customer._id,
          artist: booking.artist._id,
          type: PAYMENT_TRANSACTION_TYPE.CANCELLATION_FEE,
          gateway: PAYMENT_GATEWAY.STRIPE_CONNECT,
          currency: 'AUD',
          amount: booking.balancePayment.amount,
          platformCreditUsed: 0,
          marketplaceFee: booking.platformCommissionAmount || 0,
          marketplaceFeeGst: booking.platformCommissionGst || 0,
          stripeFeeBorne: booking.stripeBalanceFee || 0,
        },
      },
      { upsert: true, new: true }
    )

    booking.balancePayment.status = PAYMENT_STAGE_STATUS.REFUNDED
    booking.depositForfeited = true
    booking.cancellationFeeCharged = round2(
      (booking.initialPayment?.amount || 0) + artistShareAmount
    )
  } else if (isInitialPaid) {
    booking.depositForfeited = true
    booking.cancellationFeeCharged = booking.initialPayment?.amount || 0
  } else {
    booking.depositForfeited = false
    booking.cancellationFeeCharged = 0
  }

  booking.status = BOOKING_STATUS.CANCELLED
  booking.cancelledBy = user._id
  booking.cancelledByRole = isAdmin && !isCustomer ? 'admin' : 'customer'
  booking.cancellationReason = cancellationReason || 'Late cancellation by customer (<24h)'
  booking.cancelledAt = new Date()
  booking.platformCreditIssued = customerCreditAmount
  await booking.save()

  const lateMessage = isBalancePaid
    ? `Booking cancelled under Late Cancellation policy (<24h). Platform retained the 20% deposit. You received $${customerCreditAmount} Platform Credit (50% of artist net payout).`
    : isInitialPaid
      ? 'Booking cancelled under Late Cancellation policy (<24h). The 20% deposit is non-refundable and forfeited.'
      : 'Booking cancelled successfully. No payment was charged.'

  await recordBookingHistory({
    booking: booking._id,
    bookingNumber: booking.bookingNumber,
    status: BOOKING_STATUS.CANCELLED,
    milestone: BOOKING_TIMELINE_MILESTONE.CANCELLED,
    title: 'Booking Cancelled',
    description: lateMessage,
    performedBy: user._id,
    performedByRole: booking.cancelledByRole,
    note: booking.cancellationReason,
  })

  return {
    message: lateMessage,
    booking,
  }
}

/**
 * Artist specific cancellation service
 */
const artistCancelBooking = async (
  user: IUser,
  bookingId: string,
  cancellationReason?: string
) => {
  const booking = await Booking.findById(bookingId).populate('artist customer')
  if (!booking) {
    throw new AppError(httpStatus.NOT_FOUND, 'Booking not found')
  }

  const isArtist = booking.artist._id.toString() === user._id.toString()
  const isAdmin = user.role === 'admin' || user.role === 'super_admin'
  if (!isArtist && !isAdmin) {
    throw new AppError(httpStatus.FORBIDDEN, 'Only the assigned artist can cancel this booking')
  }

  if (
    booking.status === BOOKING_STATUS.CANCELLED ||
    booking.status === BOOKING_STATUS.COMPLETED ||
    booking.status === BOOKING_STATUS.DECLINED ||
    booking.status === BOOKING_STATUS.NO_SHOW
  ) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `Cannot cancel booking that is already '${booking.status}'`
    )
  }

  const appointmentDateStr = moment.utc(booking.bookingDate).format('YYYY-MM-DD')
  const appointmentDateTime = moment(
    `${appointmentDateStr} ${booking.startTime}`,
    'YYYY-MM-DD HH:mm'
  )
  const hoursUntilAppointment = appointmentDateTime.diff(moment(), 'hours', true)

  const isInitialPaid = booking.initialPayment.status === PAYMENT_STAGE_STATUS.CAPTURED
  const isBalancePaid =
    booking.balancePayment.status === PAYMENT_STAGE_STATUS.CAPTURED &&
    (booking.balancePayment.amount || 0) > 0

  // Release promo code if applied and deposit was captured
  if (booking.promoCode && isInitialPaid) {
    await PromoCode.findByIdAndUpdate(booking.promoCode, { $inc: { usageCount: -1 } })
  }

  // Void Stripe invoices if exist
  await voidOrCreditNoteInvoice(booking.stripeInvoiceId, booking.bookingNumber)
  await voidOrCreditNoteInvoice(booking.artistStripeInvoiceId, booking.bookingNumber)

  // Scenario C: Artist cancels - Issue Platform Credit to customer minus transaction fee
  const depositPaid = isInitialPaid ? (booking.initialPayment.amount || 0) : 0
  const balancePaid = isBalancePaid ? (booking.balancePayment.amount || 0) : 0
  const totalPaid = round2(depositPaid + balancePaid)

  // Deduct processing transaction fee incurred on payment
  const totalTransactionFee = round2(
    (isInitialPaid ? (booking.stripeInitialFee || 0) : 0) +
      (isBalancePaid ? (booking.stripeBalanceFee || 0) : 0)
  )
  const refundCreditAmount = round2(Math.max(0, totalPaid - totalTransactionFee))

  if (refundCreditAmount > 0) {
    const alreadyCredited = await WalletLedger.findOne({
      booking: booking._id,
      source: WALLET_SOURCE.CANCELLATION_CREDIT,
    })
    if (!alreadyCredited) {
      await walletServices.creditUserWallet({
        userId: booking.customer._id,
        amount: refundCreditAmount,
        source: WALLET_SOURCE.CANCELLATION_CREDIT,
        bookingId: booking._id,
        bookingGroupId: booking.bookingGroupId,
        description: `Artist cancelled booking #${booking.bookingNumber} - Platform credit issued ($${totalPaid} minus $${totalTransactionFee} transaction fee, valid 36 months)`,
      })
    }
  }

  // Restore platform credit if customer originally used credit
  if (booking.platformCreditApplied > 0) {
    const alreadyRestored = await WalletLedger.findOne({
      booking: booking._id,
      source: WALLET_SOURCE.BOOKING_ROLLBACK,
    })
    if (!alreadyRestored) {
      await walletServices.creditUserWallet({
        userId: booking.customer._id,
        amount: booking.platformCreditApplied,
        source: WALLET_SOURCE.BOOKING_ROLLBACK,
        bookingId: booking._id,
        description: `Artist cancelled booking #${booking.bookingNumber} - credit restored`,
      })
    }
  }

  // Artist Penalty Calculation & Flagging (Point 9, 10, 11)
  const artistUserId = booking.artist._id
  const artistProfile = await ArtistProfile.findOne({ user: artistUserId })
  let penaltyIncurred = 0
  let isSuspended = false

  if (artistProfile) {
    artistProfile.cancelBookingCount = (artistProfile.cancelBookingCount || 0) + 1

    const platformSettings = await PlatformSettings.getSettings()
    const penaltyCalc = calculateArtistCancellationPenalty(
      booking.totalBookingPrice || booking.grossAmount || 0,
      hoursUntilAppointment,
      platformSettings
    )

    if (penaltyCalc.penaltyAmount > 0) {
      artistProfile.isPenaltyRequired = true
      penaltyIncurred = penaltyCalc.penaltyAmount

      await Penalty.create({
        booking: booking._id,
        bookingNumber: booking.bookingNumber,
        customer: booking.customer._id,
        artist: booking.artist._id,
        bookingAmount: booking.totalBookingPrice || booking.grossAmount || 0,
        budgetTier: penaltyCalc.budgetTier,
        timeframeTier: penaltyCalc.timeframeTier,
        penaltyAmount: penaltyCalc.penaltyAmount,
        currency: 'AUD',
        reason: cancellationReason || 'Artist cancelled appointment',
        isPenaltyRequired: true,
        status: PENALTY_STATUS.PENDING,
        deductedFromWallet: false,
      })

      // Point 11: If cancelled within 48 hours (< 48h / last moment), hard block suspend the artist account!
      if (hoursUntilAppointment <= 48) {
        isSuspended = true
        await User.findByIdAndUpdate(artistUserId, { status: AuthStatus.SUSPENDED })
        logger.warn(
          `[Artist Suspended] Artist ${artistUserId} account SUSPENDED due to last-minute cancellation (<48h) for booking ${booking.bookingNumber}.`
        )
      } else {
        logger.warn(
          `[Artist Penalty] Artist ${artistUserId} incurred $${penaltyCalc.penaltyAmount} AUD penalty (${penaltyCalc.budgetTier} tier, ${penaltyCalc.timeframeTier}) for cancelling booking ${booking.bookingNumber}. Profile hidden from discovery.`
        )
      }
    }

    await artistProfile.save()
  }

  booking.status = BOOKING_STATUS.CANCELLED
  booking.cancelledBy = user._id
  booking.cancelledByRole = isAdmin && !isArtist ? 'admin' : 'artist'
  booking.cancellationReason = cancellationReason || 'Artist cancelled appointment'
  booking.cancelledAt = new Date()
  if (isInitialPaid) {
    booking.initialPayment.status = PAYMENT_STAGE_STATUS.REFUNDED
  }
  if (isBalancePaid) {
    booking.balancePayment.status = PAYMENT_STAGE_STATUS.REFUNDED
  }
  booking.platformCreditIssued = refundCreditAmount
  await booking.save()

  // Find nearby alternative artists for customer (Point 8)
  const nearbyAlternativeArtists = await ArtistServices.find({
    isActive: true,
    artist: { $ne: booking.artist._id },
  })
    .limit(6)
    .populate('artist', 'name profileImage')
    .populate('category', 'name')
    .lean()

  const refundSummary =
    totalPaid > 0
      ? `Customer received $${refundCreditAmount} Platform Credit ($${totalPaid} minus $${totalTransactionFee} transaction fee).`
      : 'No payment had been charged to the customer.'

  const artistCancelMessage = isSuspended
    ? `Booking cancelled. ${refundSummary} Your account has been SUSPENDED due to last-moment cancellation (<48h). A penalty of $${penaltyIncurred} AUD must be paid to reactivate your account.`
    : penaltyIncurred > 0
      ? `Booking cancelled. ${refundSummary} A penalty of $${penaltyIncurred} AUD was issued and your profile is hidden from customer search until paid.`
      : `Booking cancelled. ${refundSummary}`

  await recordBookingHistory({
    booking: booking._id,
    bookingNumber: booking.bookingNumber,
    status: BOOKING_STATUS.CANCELLED,
    milestone: BOOKING_TIMELINE_MILESTONE.CANCELLED,
    title: 'Booking Cancelled by Artist',
    description: artistCancelMessage,
    performedBy: user._id,
    performedByRole: booking.cancelledByRole,
    note: booking.cancellationReason,
  })

  try {
    await notificationServices.sendNotification({
      recipient: (booking.customer as any)._id || booking.customer,
      sender: user._id,
      senderName: user.name,
      senderPicture: user.profileImage,
      title: 'Booking Cancelled by Artist',
      message: `${user.name} has cancelled booking #${booking.bookingNumber}. Platform credit has been issued.`,
      type: NOTIFICATION_TYPE.BOOKING_CANCELLED,
      bookingId: booking._id,
      bookingNumber: booking.bookingNumber,
      actionUrl: `/bookings/${booking._id}`,
    })
  } catch (notifErr) {
    logger.warn('[Booking Notification] Failed to notify customer:', notifErr)
  }

  return {
    message: artistCancelMessage,
    booking,
    nearbyAlternativeArtists,
  }
}

/**
 * Cancel Booking adhering to the 24h refund / forfeiture policy
 * Routes to customerCancelBooking or artistCancelBooking based on role, or executes admin cancellation.
 */
const cancelBooking = async (user: IUser, bookingId: string, cancellationReason?: string) => {
  const booking = await Booking.findById(bookingId).populate('artist customer')
  if (!booking) {
    throw new AppError(httpStatus.NOT_FOUND, 'Booking not found')
  }

  const isCustomer = booking.customer._id.toString() === user._id.toString()
  const isArtist = booking.artist._id.toString() === user._id.toString()
  const isAdmin = user.role === 'admin' || user.role === 'super_admin'

  if (!isCustomer && !isArtist && !isAdmin) {
    throw new AppError(httpStatus.FORBIDDEN, 'You are not authorized to cancel this booking')
  }

  if (
    booking.status === BOOKING_STATUS.CANCELLED ||
    booking.status === BOOKING_STATUS.COMPLETED ||
    booking.status === BOOKING_STATUS.DECLINED ||
    booking.status === BOOKING_STATUS.NO_SHOW
  ) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `Cannot cancel booking that is already '${booking.status}'`
    )
  }

  if (isCustomer) {
    return customerCancelBooking(user, bookingId, cancellationReason)
  }

  if (isArtist) {
    return artistCancelBooking(user, bookingId, cancellationReason)
  }

  // Admin cancellation
  if (booking.promoCode && booking.initialPayment?.status === PAYMENT_STAGE_STATUS.CAPTURED) {
    await PromoCode.findByIdAndUpdate(booking.promoCode, { $inc: { usageCount: -1 } })
  }
  await voidOrCreditNoteInvoice(booking.stripeInvoiceId, booking.bookingNumber)
  if (booking.artistStripeInvoiceId) {
    await voidOrCreditNoteInvoice(booking.artistStripeInvoiceId, booking.bookingNumber)
  }

  booking.status = BOOKING_STATUS.CANCELLED
  booking.cancelledBy = user._id
  booking.cancelledByRole = 'admin'
  booking.cancellationReason = cancellationReason || 'Cancelled by admin'
  booking.cancelledAt = new Date()
  await booking.save()

  await recordBookingHistory({
    booking: booking._id,
    bookingNumber: booking.bookingNumber,
    status: BOOKING_STATUS.CANCELLED,
    milestone: BOOKING_TIMELINE_MILESTONE.CANCELLED,
    title: 'Booking Cancelled by Admin',
    description: booking.cancellationReason,
    performedBy: user._id,
    performedByRole: 'admin',
    note: booking.cancellationReason,
  })

  return { message: 'Booking cancelled by admin.', booking }
}

/**
 * Get user bookings list
 */
const getMyBookings = async (
  user: IUser,
  query: { page?: number; limit?: number; status?: string; tab?: string }
) => {
  const page = Number(query.page || 1)
  const limit = Number(query.limit || 10)
  const skip = (page - 1) * limit

  const filter: any = {}
  if (user.role === 'artist') {
    filter.artist = user._id
  } else {
    filter.customer = user._id
  }

  if (query.status && query.status.toLowerCase() !== 'all') {
    const st = query.status.toLowerCase()
    if (st === 'accepted') {
      filter.status = BOOKING_STATUS.ACCEPTED
    } else if (st === 'pending') {
      filter.status = { $in: [BOOKING_STATUS.REQUESTED, BOOKING_STATUS.ACCEPTED] }
    } else if (st === 'requested' || st === 'new_requests') {
      filter.status = BOOKING_STATUS.REQUESTED
    } else if (st === 'confirmed') {
      filter.status = { $in: [BOOKING_STATUS.CONFIRMED, BOOKING_STATUS.RESCHEDULED] }
    } else if (st === 'in_progress' || st === 'in progress') {
      filter.status = BOOKING_STATUS.IN_PROGRESS
    } else if (st === 'completed') {
      filter.status = BOOKING_STATUS.COMPLETED
    } else if (st === 'cancelled' || st === 'canceled') {
      filter.status = { $in: [BOOKING_STATUS.CANCELLED, BOOKING_STATUS.DECLINED, BOOKING_STATUS.NO_SHOW] }
    } else {
      filter.status = query.status
    }
  } else if (query.tab) {
    const todayStart = moment().startOf('day').toDate()
    switch (query.tab) {
      case 'accepted':
        filter.status = BOOKING_STATUS.ACCEPTED
        break
      case 'upcoming':
        filter.bookingDate = { $gte: todayStart }
        filter.status = {
          $in: [BOOKING_STATUS.CONFIRMED, BOOKING_STATUS.IN_PROGRESS, BOOKING_STATUS.RESCHEDULED],
        }
        break
      case 'pending':
        filter.status = {
          $in: [BOOKING_STATUS.REQUESTED, BOOKING_STATUS.ACCEPTED],
        }
        break
      case 'new_requests':
        filter.status = BOOKING_STATUS.REQUESTED
        break
      case 'completed':
        filter.status = BOOKING_STATUS.COMPLETED
        break
      case 'cancelled':
        filter.status = {
          $in: [BOOKING_STATUS.CANCELLED, BOOKING_STATUS.DECLINED, BOOKING_STATUS.NO_SHOW],
        }
        break
      default:
        break
    }
  }

  const isAscendingSort =
    query.tab === 'upcoming' ||
    query.tab === 'new_requests' ||
    query.tab === 'accepted' ||
    query.status?.toLowerCase() === 'accepted' ||
    query.status?.toLowerCase() === 'requested'

  const sortOrder: any = isAscendingSort
    ? { bookingDate: 1, startTime: 1 }
    : { bookingDate: -1, startTime: -1 }

  const [bookings, total] = await Promise.all([
    Booking.find(filter)
      .sort(sortOrder)
      .skip(skip)
      .limit(limit)
      .populate('service', 'name durationMinutes price')
      .populate('services', 'name durationMinutes price')
      .populate('artist', 'name profileImage profilePicture')
      .populate('customer', 'name profileImage profilePicture phone')
      .lean(),
    Booking.countDocuments(filter),
  ])

  const bookingIds = bookings.map((b: any) => b._id)
  const bookingReviews =
    bookingIds.length > 0
      ? await Review.find({ booking: { $in: bookingIds }, isActive: true })
          .select('_id booking rating comment tags images beforeImage afterImage createdAt')
          .lean()
      : []

  const reviewByBookingId = new Map(bookingReviews.map((r: any) => [String(r.booking), r]))

  const enrichedBookings = bookings.map((b: any) => ({
    ...b,
    review: reviewByBookingId.get(String(b._id)) || null,
  }))

  return {
    bookings: enrichedBookings,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  }
}

/**
 * Get single booking detailed invoice & appointment view
 */
const getBookingById = async (user: IUser, bookingId: string) => {
  const booking = await Booking.findById(bookingId)
    .populate('service')
    .populate('services')
    .populate('artist', 'name email profileImage profilePicture phone')
    .populate('customer', 'name email profileImage profilePicture phone')
    .populate('address')
    .populate('promoCode', 'promotionName promoCode discountType discountValue')

  if (!booking) {
    throw new AppError(httpStatus.NOT_FOUND, 'Booking not found')
  }

  const isCustomer = booking.customer._id.toString() === user._id.toString()
  const isArtist = booking.artist._id.toString() === user._id.toString()
  const isAdmin = user.role === 'admin' || user.role === 'super_admin'

  if (!isCustomer && !isArtist && !isAdmin) {
    throw new AppError(httpStatus.FORBIDDEN, 'Access denied to this booking')
  }

  if (
    booking.initialPayment?.status === PAYMENT_STAGE_STATUS.CAPTURED &&
    (!booking.stripeInvoiceId || !booking.stripeInvoiceUrl || !booking.stripeInvoicePdf)
  ) {
    await issueCustomerStripeInvoice(booking)
  }

  if (
    booking.balancePayment?.status === PAYMENT_STAGE_STATUS.CAPTURED &&
    (!booking.artistStripeInvoiceId ||
      !booking.artistStripeInvoiceUrl ||
      !booking.artistStripeInvoicePdf)
  ) {
    await issueArtistRctiStripeInvoice(booking)
  }

  const [artistReviews, bookingReview] = await Promise.all([
    Review.find({ artist: booking.artist._id, isActive: true }).select('rating').lean(),
    Review.findOne({ booking: booking._id, isActive: true }).lean(),
  ])

  const reviewsCount = artistReviews.length
  const artistRating = reviewsCount
    ? Number(
        (artistReviews.reduce((acc, r) => acc + (r.rating || 0), 0) / reviewsCount).toFixed(1)
      )
    : 0

  const bookingObj = booking.toObject() as Record<string, any>
  if (bookingObj.artist && typeof bookingObj.artist === 'object') {
    bookingObj.artist.rating = artistRating
    bookingObj.artist.reviewsCount = reviewsCount
  }
  bookingObj.review = bookingReview || null

  return bookingObj
}

/**
 * Pay remaining 80% balance (manual customer settlement or retry during 1-hour rectification)
 */
const payBalance = async (user: IUser, bookingId: string, paymentMethodId?: string) => {
  const booking = await Booking.findOne({
    _id: bookingId,
    customer: user._id,
  })

  if (!booking) {
    throw new AppError(httpStatus.NOT_FOUND, 'Booking not found')
  }

  if (booking.balancePayment.status === PAYMENT_STAGE_STATUS.CAPTURED) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Remaining balance is already paid')
  }

  if (booking.status === BOOKING_STATUS.CANCELLED || booking.status === BOOKING_STATUS.DECLINED) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Booking is cancelled and cannot be paid')
  }

  let effectivePaymentMethodId: string | undefined
  if (paymentMethodId) {
    const existingCard = await PaymentMethod.findOne(
      mongoose.isValidObjectId(paymentMethodId)
        ? { _id: paymentMethodId }
        : { stripePaymentMethodId: paymentMethodId }
    )
    if (!existingCard) {
      throw new AppError(
        httpStatus.NOT_FOUND,
        'Payment method is not listed in the database. Please provide a valid saved payment method.'
      )
    }
    if (existingCard.user.toString() !== user._id.toString()) {
      throw new AppError(
        httpStatus.FORBIDDEN,
        'Selected payment method is not listed under your account.'
      )
    }
    effectivePaymentMethodId = existingCard.stripePaymentMethodId
    booking.stripePaymentMethodId = effectivePaymentMethodId
  } else if (booking.stripePaymentMethodId) {
    const bookedCard = await PaymentMethod.findOne({
      stripePaymentMethodId: booking.stripePaymentMethodId,
      user: user._id,
    })
    if (bookedCard) {
      effectivePaymentMethodId = bookedCard.stripePaymentMethodId
    }
  }

  if (!effectivePaymentMethodId) {
    const defaultCard = await PaymentMethod.findOne({ user: user._id, isDefault: true })
    if (defaultCard) {
      effectivePaymentMethodId = defaultCard.stripePaymentMethodId
      booking.stripePaymentMethodId = effectivePaymentMethodId
    } else {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'No payment method provided or saved on your account for balance payment'
      )
    }
  }

  const transferGroup = booking.bookingGroupId || `GRP-${booking.bookingNumber}`

  try {
    const piParams: Stripe.PaymentIntentCreateParams = {
      amount: Math.round(booking.balancePayment.amount * 100),
      currency: 'aud',
      payment_method: effectivePaymentMethodId,
      confirm: true,
      off_session: true,
      transfer_group: transferGroup,
      metadata: {
        bookingNumber: booking.bookingNumber,
        bookingGroupId: transferGroup,
        bookingId: (booking as any)._id.toString(),
        userId: user._id.toString(),
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

      // Mark customer master invoice paid in full in Stripe
      if (booking.stripeInvoiceId) {
        try {
          await stripe.invoices.pay(booking.stripeInvoiceId, { paid_out_of_band: true })
        } catch (e: any) {
          // safe fallback
        }
      }

      // Automatically issue official Recipient Created Tax Invoice (RCTI) for artist
      await issueArtistRctiStripeInvoice(booking)

      const existingTxn = await PaymentTransaction.findOne({
        $or: [
          { stripePaymentIntentId: paymentIntent.id },
          { booking: (booking as any)._id, type: PAYMENT_TRANSACTION_TYPE.BALANCE_80 },
        ],
      })
      if (existingTxn) {
        existingTxn.status = PAYMENT_STATUS.SUCCEEDED
        existingTxn.stripePaymentIntentId = paymentIntent.id
        await existingTxn.save()
      } else {
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
      }

      await recordBookingHistory({
        booking: (booking as any)._id,
        bookingNumber: booking.bookingNumber,
        status: booking.status,
        milestone: BOOKING_TIMELINE_MILESTONE.PAYMENT_COMPLETED,
        title: 'Balance Payment Completed',
        description: `Remaining 80% balance ($${booking.balancePayment.amount} AUD) paid in full`,
        performedBy: user._id,
        performedByRole: 'customer',
        metadata: { stripePaymentIntentId: paymentIntent.id },
      })

      return {
        success: true,
        message: 'Balance payment succeeded and marked paid in full',
        booking,
      }
    } else {
      throw new Error(`PaymentIntent status: ${paymentIntent.status}`)
    }
  } catch (err: any) {
    booking.balancePayment.status = PAYMENT_STAGE_STATUS.FAILED
    if (!booking.balancePayment.rectificationDeadline) {
      booking.balancePayment.rectificationDeadline = moment().add(2, 'hours').toDate()
    }
    await booking.save()

    throw new AppError(
      httpStatus.PAYMENT_REQUIRED,
      `Balance payment failed: ${err?.message || 'Card declined'}. Rectification deadline: ${booking.balancePayment.rectificationDeadline?.toISOString()}`
    )
  }
}

const customerInvoiceLocks = new Map<string, Promise<any>>()
const artistRctiLocks = new Map<string, Promise<any>>()

/**
 * Sync Stripe customer balance to the exact desired credit (in cents) so that
 * Subtotal and Total remain 100% accurate and Applied balance equals the exact deposit/credit.
 */
const syncCustomerCreditBalance = async (
  stripeCustomerId: string,
  desiredCreditCents: number,
  bookingNumber: string,
  bookingGroupId: string
) => {
  try {
    const stripeCust = await stripe.customers.retrieve(stripeCustomerId)
    if (stripeCust.deleted) return
    const currentBalance = typeof stripeCust.balance === 'number' ? stripeCust.balance : 0
    const targetBalance = -Math.max(0, Math.round(desiredCreditCents))
    const delta = targetBalance - currentBalance
    if (delta !== 0) {
      await stripe.customers.createBalanceTransaction(stripeCustomerId, {
        amount: delta,
        currency: 'aud',
        description:
          desiredCreditCents > 0
            ? `Initial Deposit / Credit Applied to Booking #${bookingNumber}`
            : `Balance sync for Booking #${bookingNumber}`,
        metadata: { bookingNumber, bookingGroupId },
      })
    }
  } catch (balErr: any) {
    logger.warn(`Failed to sync customer credit balance: ${balErr?.message}`)
  }
}

/**
 * Issue official Customer Master Tax Invoice in Stripe for the booking
 */
const issueCustomerStripeInvoice = async (booking: any) => {
  const lockKey = String(
    booking.customer?._id || booking.customer || booking._id || booking.bookingNumber
  )
  const existingLock = customerInvoiceLocks.get(lockKey)
  if (existingLock) {
    await existingLock.catch(() => null)
  }

  const task = (async () => {
    if (booking.stripeInvoiceId && booking.stripeInvoiceUrl && booking.stripeInvoicePdf) {
      return {
        stripeInvoiceId: booking.stripeInvoiceId,
        stripeInvoiceUrl: booking.stripeInvoiceUrl,
        stripeInvoicePdf: booking.stripeInvoicePdf,
      }
    }

    // Prevent concurrency race conditions with Stripe webhooks
    const freshBooking = await Booking.findById(booking._id || booking.id)
    if (
      freshBooking?.stripeInvoiceId &&
      freshBooking?.stripeInvoiceUrl &&
      freshBooking?.stripeInvoicePdf
    ) {
      booking.stripeInvoiceId = freshBooking.stripeInvoiceId
      booking.stripeInvoiceUrl = freshBooking.stripeInvoiceUrl
      booking.stripeInvoicePdf = freshBooking.stripeInvoicePdf
      return {
        stripeInvoiceId: freshBooking.stripeInvoiceId,
        stripeInvoiceUrl: freshBooking.stripeInvoiceUrl,
        stripeInvoicePdf: freshBooking.stripeInvoicePdf,
      }
    }

    try {
      const existingInvId = booking.stripeInvoiceId || freshBooking?.stripeInvoiceId
      if (existingInvId) {
        try {
          let inv = await stripe.invoices.retrieve(existingInvId)
          if (inv.status === 'draft') {
            await stripe.invoices.update(inv.id, {
              due_date: Math.floor(Date.now() / 1000) + 86400,
            })
            inv = await stripe.invoices.finalizeInvoice(inv.id)
          }
          if (inv.hosted_invoice_url || inv.invoice_pdf) {
            booking.stripeInvoiceId = inv.id
            booking.stripeInvoiceUrl = inv.hosted_invoice_url || null
            booking.stripeInvoicePdf = inv.invoice_pdf || null
            await Booking.findByIdAndUpdate(booking._id, {
              stripeInvoiceId: inv.id,
              stripeInvoiceUrl: inv.hosted_invoice_url || null,
              stripeInvoicePdf: inv.invoice_pdf || null,
            })
            return {
              stripeInvoiceId: inv.id,
              stripeInvoiceUrl: inv.hosted_invoice_url,
              stripeInvoicePdf: inv.invoice_pdf,
            }
          }
        } catch {
          // continue
        }
      }

      const customerUser = await User.findById(booking.customer?._id || booking.customer)
      const artistProfile = await ArtistProfile.findOne({
        user: booking.artist?._id || booking.artist,
      })
      const serviceIds =
        Array.isArray(booking.services) && booking.services.length > 0
          ? booking.services.map((s: any) => s?._id || s)
          : [booking.service?._id || booking.service].filter(Boolean)
      const fetchedServices =
        serviceIds.length > 0 ? await ArtistServices.find({ _id: { $in: serviceIds } }) : []
      const serviceNames =
        fetchedServices.length > 0
          ? fetchedServices.map((s) => s.name).join(', ')
          : (booking.service as any)?.name || 'Beauty Service'
      const stripeCustomerId = booking.stripeCustomerId || customerUser?.stripeCustomerId
      if (!stripeCustomerId) return null

      // Check Stripe directly if an invoice for this bookingNumber was already created
      try {
        const existingInvoices = await stripe.invoices.list({
          customer: stripeCustomerId,
          limit: 10,
        })
        let matched = existingInvoices.data.find(
          (inv) => inv.metadata?.bookingNumber === booking.bookingNumber && inv.status !== 'void'
        )
        if (matched) {
          if (matched.status === 'draft') {
            try {
              await stripe.invoices.update(matched.id, {
                due_date: Math.floor(Date.now() / 1000) + 86400,
              })
              matched = await stripe.invoices.finalizeInvoice(matched.id)
            } catch {
              matched = await stripe.invoices.retrieve(matched.id)
            }
          }
          booking.stripeInvoiceId = matched.id
          booking.stripeInvoiceUrl = matched.hosted_invoice_url || null
          booking.stripeInvoicePdf = matched.invoice_pdf || null
          await Booking.findByIdAndUpdate(booking._id, {
            stripeInvoiceId: matched.id,
            stripeInvoiceUrl: matched.hosted_invoice_url || null,
            stripeInvoicePdf: matched.invoice_pdf || null,
          })
          return {
            stripeInvoiceId: matched.id,
            stripeInvoiceUrl: matched.hosted_invoice_url,
            stripeInvoicePdf: matched.invoice_pdf,
          }
        }
      } catch {
        // Safe fallback if invoice list fails
      }

      const bookingGroupId = booking.bookingGroupId || `GRP-${booking.bookingNumber}`
      const artistDisplayName = artistProfile?.businessName || 'Independent Artist'
      const artistAbnText = artistProfile?.abn ? `, ABN: ${artistProfile.abn}` : ''

      const siteTitle = configs.site?.name || 'Stunner alert'
      const appointmentDateStr = `${moment(booking.bookingDate).format('DD MMM YYYY')}, ${booking.startTime}`

      let dueDateUnix: number | undefined
      if (booking.balancePayment?.dueDate) {
        const targetUnix = Math.floor(new Date(booking.balancePayment.dueDate).getTime() / 1000)
        const nowPlusOneHour = Math.floor(Date.now() / 1000) + 3600
        dueDateUnix = Math.max(targetUnix, nowPlusOneHour)
      }

      let desiredCreditCents = 0
      if (booking.balancePayment?.status !== 'captured') {
        if (booking.initialPayment?.status === 'captured' && booking.initialPayment.amount > 0) {
          desiredCreditCents += Math.round(booking.initialPayment.amount * 100)
        }
        if (booking.platformCreditApplied > 0) {
          desiredCreditCents += Math.round(booking.platformCreditApplied * 100)
        }
      }

      // Sync customer credit balance before draft creation so Stripe never double-deducts
      await syncCustomerCreditBalance(
        stripeCustomerId,
        desiredCreditCents,
        booking.bookingNumber,
        bookingGroupId
      )

      // Create draft first with custom fields, footer, and full breakdown description
      const stripeInvoice = await stripe.invoices.create({
        customer: stripeCustomerId,
        currency: 'aud',
        auto_advance: false,
        collection_method: 'send_invoice',
        ...(dueDateUnix ? { due_date: dueDateUnix } : { days_until_due: 1 }),
        pending_invoice_items_behavior: 'exclude',
        description: `Tax Invoice for Booking #${booking.bookingNumber} | Service: ${serviceNames} (${appointmentDateStr}) | Initial Deposit (${booking.initialPayment?.percentage || 20}%): $${(booking.initialPayment?.amount || 0).toFixed(2)} AUD [PAID] | Balance Due (80%): $${(booking.balancePayment?.amount || 0).toFixed(2)} AUD`,
        custom_fields: [
          { name: 'Booking Ref', value: `#${booking.bookingNumber}` },
          { name: 'Appointment', value: appointmentDateStr.substring(0, 30) },
          { name: 'Artist ABN', value: (artistProfile?.abn || 'Not Registered').substring(0, 30) },
          {
            name: 'Deposit Paid (20%)',
            value: `$${(booking.initialPayment?.amount || 0).toFixed(2)} AUD [PAID]`.substring(
              0,
              30
            ),
          },
        ],
        footer: `${siteTitle} - Official Tax Invoice. All prices in AUD and include 10% Australian GST (where applicable). Remaining 80% balance is automatically charged 24 hours prior to appointment.`,
        metadata: {
          bookingNumber: booking.bookingNumber,
          bookingGroupId,
          userId: (booking.customer?._id || booking.customer).toString(),
          artistId: (booking.artist?._id || booking.artist).toString(),
          gstAmount: (booking.gstAmount || 0).toString(),
          initialDeposit: (booking.initialPayment?.amount || 0).toString(),
          balanceDue: (booking.balancePayment?.amount || 0).toString(),
        },
      })
      const invoice = stripeInvoice.id
      // Ensure official Stripe 10% GST Tax Rate is applied to invoice items
      let gstTaxRateId = booking.stripeGstTaxRateId
      if (!gstTaxRateId && booking.gstAmount > 0) {
        try {
          const platformSettings = await PlatformSettings.getSettings()
          if (platformSettings.stripeGstTaxRateId) {
            gstTaxRateId = platformSettings.stripeGstTaxRateId
          } else {
            const taxRate = await getOrCreateStripeGstTaxRate(platformSettings.gstPercentage || 10)
            gstTaxRateId = taxRate.id
            platformSettings.stripeGstTaxRateId = taxRate.id
            await platformSettings.save()
          }
          booking.stripeGstTaxRateId = gstTaxRateId
          await Booking.findByIdAndUpdate(booking._id, { stripeGstTaxRateId: gstTaxRateId })
        } catch (taxErr: any) {
          logger.warn(`Failed to resolve Stripe GST tax rate: ${taxErr?.message}`)
        }
      }

      const gstTax =
        gstTaxRateId && (booking.gstAmount || 0) > 0 ? { tax_rates: [gstTaxRateId] } : {}

      try {
        await stripe.invoiceItems.create({
          customer: stripeCustomerId,
          invoice,
          amount: Math.round(booking.servicePrice * 100),
          currency: 'aud',
          description: `${serviceNames} (Supplied by Artist: ${artistDisplayName}${artistAbnText})`,
          ...gstTax,
          metadata: {
            bookingNumber: booking.bookingNumber,
            bookingGroupId,
            type: 'SERVICE_CHARGE',
          },
        })

        if (booking.travelFee > 0) {
          await stripe.invoiceItems.create({
            customer: stripeCustomerId,
            invoice,
            amount: Math.round(booking.travelFee * 100),
            currency: 'aud',
            description: 'Mobile Artist Travel Surcharge',
            ...gstTax,
            metadata: { bookingNumber: booking.bookingNumber, bookingGroupId, type: 'TRAVEL_FEE' },
          })
        }

        if (booking.parkingFee > 0) {
          await stripe.invoiceItems.create({
            customer: stripeCustomerId,
            invoice,
            amount: Math.round(booking.parkingFee * 100),
            currency: 'aud',
            description: 'Artist Parking Fee Reimbursement',
            ...gstTax,
            metadata: { bookingNumber: booking.bookingNumber, bookingGroupId, type: 'PARKING_FEE' },
          })
        }

        if (booking.discountAmount > 0) {
          await stripe.invoiceItems.create({
            customer: stripeCustomerId,
            invoice,
            amount: -Math.round(booking.discountAmount * 100),
            currency: 'aud',
            description: `Promo Code Discount: ${booking.promoCodeText || 'PROMO'}`,
            metadata: {
              bookingNumber: booking.bookingNumber,
              bookingGroupId,
              type: 'PROMO_DISCOUNT',
            },
          })
        }
      } catch (itemErr: any) {
        logger.error(
          `[Stripe Invoice] Line item creation failed, using single-line fallback: ${itemErr?.message}`
        )
        await stripe.invoiceItems.create({
          customer: stripeCustomerId,
          invoice,
          amount: Math.round(booking.totalBookingPrice * 100),
          currency: 'aud',
          description: `Booking #${booking.bookingNumber} - ${serviceNames}`,
          metadata: { bookingNumber: booking.bookingNumber, bookingGroupId },
        })
      }

      // Verify customer credit balance right before finalization so Applied balance is exact
      await syncCustomerCreditBalance(
        stripeCustomerId,
        desiredCreditCents,
        booking.bookingNumber,
        bookingGroupId
      )

      let finalizedInvoice = await stripe.invoices.finalizeInvoice(stripeInvoice.id)

      // Only mark invoice paid if the full balance is already captured (e.g. covered by credit)
      if (booking.balancePayment?.status === 'captured') {
        try {
          finalizedInvoice = await stripe.invoices.pay(finalizedInvoice.id, {
            paid_out_of_band: true,
          })
        } catch (e: any) {
          // safe fallback
        }
      }

      booking.stripeInvoiceId = finalizedInvoice.id
      booking.stripeInvoiceUrl = finalizedInvoice.hosted_invoice_url || null
      booking.stripeInvoicePdf = finalizedInvoice.invoice_pdf || null
      await Booking.findByIdAndUpdate(booking._id, {
        stripeInvoiceId: finalizedInvoice.id,
        stripeInvoiceUrl: finalizedInvoice.hosted_invoice_url || null,
        stripeInvoicePdf: finalizedInvoice.invoice_pdf || null,
      })

      return {
        stripeInvoiceId: finalizedInvoice.id,
        stripeInvoiceUrl: finalizedInvoice.hosted_invoice_url,
        stripeInvoicePdf: finalizedInvoice.invoice_pdf,
      }
    } catch (err: any) {
      logger.error(`[Stripe Invoice] Failed to issue Customer Stripe invoice: ${err?.message}`)
      return null
    }
  })()

  customerInvoiceLocks.set(lockKey, task)
  try {
    return await task
  } finally {
    if (customerInvoiceLocks.get(lockKey) === task) {
      customerInvoiceLocks.delete(lockKey)
    }
  }
}

/**
 * Issue official Recipient Created Tax Invoice (RCTI) in Stripe for the Artist
 */
const issueArtistRctiStripeInvoice = async (booking: any) => {
  const lockKey = String(booking._id || booking.id || booking.bookingNumber)
  const existingLock = artistRctiLocks.get(lockKey)
  if (existingLock) {
    await existingLock.catch(() => null)
  }

  const task = (async () => {
    if (
      booking.artistStripeInvoiceId &&
      booking.artistStripeInvoiceUrl &&
      booking.artistStripeInvoicePdf
    ) {
      return {
        artistStripeInvoiceId: booking.artistStripeInvoiceId,
        artistStripeInvoiceUrl: booking.artistStripeInvoiceUrl,
        artistStripeInvoicePdf: booking.artistStripeInvoicePdf,
      }
    }

    // Prevent concurrency race conditions with Stripe webhooks
    const freshBooking = await Booking.findById(booking._id || booking.id)
    if (
      freshBooking?.artistStripeInvoiceId &&
      freshBooking?.artistStripeInvoiceUrl &&
      freshBooking?.artistStripeInvoicePdf
    ) {
      booking.artistStripeInvoiceId = freshBooking.artistStripeInvoiceId
      booking.artistStripeInvoiceUrl = freshBooking.artistStripeInvoiceUrl
      booking.artistStripeInvoicePdf = freshBooking.artistStripeInvoicePdf
      return {
        artistStripeInvoiceId: freshBooking.artistStripeInvoiceId,
        artistStripeInvoiceUrl: freshBooking.artistStripeInvoiceUrl,
        artistStripeInvoicePdf: freshBooking.artistStripeInvoicePdf,
      }
    }

    try {
      const existingRctiId = booking.artistStripeInvoiceId || freshBooking?.artistStripeInvoiceId
      if (existingRctiId) {
        try {
          let inv = await stripe.invoices.retrieve(existingRctiId)
          if (inv.status === 'draft') {
            await stripe.invoices.update(inv.id, {
              due_date: Math.floor(Date.now() / 1000) + 86400,
            })
            inv = await stripe.invoices.finalizeInvoice(inv.id)
            try {
              inv = await stripe.invoices.pay(inv.id, { paid_out_of_band: true })
            } catch {
              // safe fallback
            }
          }
          if (inv.hosted_invoice_url || inv.invoice_pdf) {
            booking.artistStripeInvoiceId = inv.id
            booking.artistStripeInvoiceUrl = inv.hosted_invoice_url || null
            booking.artistStripeInvoicePdf = inv.invoice_pdf || null
            await Booking.findByIdAndUpdate(booking._id, {
              artistStripeInvoiceId: inv.id,
              artistStripeInvoiceUrl: inv.hosted_invoice_url || null,
              artistStripeInvoicePdf: inv.invoice_pdf || null,
            })
            return {
              artistStripeInvoiceId: inv.id,
              artistStripeInvoiceUrl: inv.hosted_invoice_url,
              artistStripeInvoicePdf: inv.invoice_pdf,
            }
          }
        } catch {
          // continue
        }
      }

      const artistId = booking.artist?._id || booking.artist
      const artistUser = await User.findById(artistId)
      const artistProfile = await ArtistProfile.findOne({ user: artistId })
      if (!artistUser) return null

      let artistCustomerId = artistUser.stripeCustomerId
      if (!artistCustomerId) {
        const customerParams: Stripe.CustomerCreateParams = {
          name: artistProfile?.businessName || artistUser.name,
          email: artistUser.email,
          metadata: {
            userId: artistUser._id.toString(),
            role: 'artist',
            businessName: artistProfile?.businessName || '',
            abn: artistProfile?.abn || '',
          },
        }
        if (artistUser.phone) {
          customerParams.phone = artistUser.phone
        }

        const customer = await stripe.customers.create(customerParams)
        artistCustomerId = customer.id
        artistUser.stripeCustomerId = artistCustomerId
        await artistUser.save()
      }

      // Check Stripe directly if an RCTI invoice for this bookingNumber was already created
      try {
        const existingInvoices = await stripe.invoices.list({
          customer: artistCustomerId,
          limit: 10,
        })
        let matched = existingInvoices.data.find(
          (inv) =>
            inv.metadata?.bookingNumber === booking.bookingNumber &&
            inv.metadata?.type === 'RCTI' &&
            inv.status !== 'void'
        )
        if (matched) {
          if (matched.status === 'draft') {
            try {
              await stripe.invoices.update(matched.id, {
                due_date: Math.floor(Date.now() / 1000) + 86400,
              })
              matched = await stripe.invoices.finalizeInvoice(matched.id)
              try {
                matched = await stripe.invoices.pay(matched.id, { paid_out_of_band: true })
              } catch {
                // safe fallback
              }
            } catch {
              matched = await stripe.invoices.retrieve(matched.id)
            }
          }
          booking.artistStripeInvoiceId = matched.id
          booking.artistStripeInvoiceUrl = matched.hosted_invoice_url || null
          booking.artistStripeInvoicePdf = matched.invoice_pdf || null
          await Booking.findByIdAndUpdate(booking._id, {
            artistStripeInvoiceId: matched.id,
            artistStripeInvoiceUrl: matched.hosted_invoice_url || null,
            artistStripeInvoicePdf: matched.invoice_pdf || null,
          })
          return {
            artistStripeInvoiceId: matched.id,
            artistStripeInvoiceUrl: matched.hosted_invoice_url,
            artistStripeInvoicePdf: matched.invoice_pdf,
          }
        }
      } catch {
        // Safe fallback if invoice list fails
      }

      const bookingGroupId = booking.bookingGroupId || `GRP-${booking.bookingNumber}`

      const grossTotal = ((booking.grossAmount || 0) + (booking.gstAmount || 0)).toFixed(2)
      const platformFee = (
        (booking.platformCommissionAmount || 0) + (booking.platformCommissionGst || 0)
      ).toFixed(2)
      const netPayout = (booking.artistNetPayout || 0).toFixed(2)

      // 1. Create the RCTI draft invoice first (days_until_due: 1 so finalizeInvoice never fails due to past due_date)
      const rctiInvoice = await stripe.invoices.create({
        customer: artistCustomerId,
        auto_advance: false,
        collection_method: 'send_invoice',
        days_until_due: 1,
        pending_invoice_items_behavior: 'exclude',
        description: `Recipient Created Tax Invoice (RCTI) - Platform Fee Deduction for Booking #${booking.bookingNumber}`,
        custom_fields: [
          { name: 'Gross Booking Total', value: `$${grossTotal} AUD` },
          { name: 'Platform Fee (20%+GST)', value: `$${platformFee} AUD` },
          { name: 'Net Artist Payout', value: `$${netPayout} AUD` },
        ],
        footer: `Gross Collection: $${grossTotal} AUD | Platform Deductions: $${platformFee} AUD | Net Payout to Artist: $${netPayout} AUD`,
        metadata: {
          bookingNumber: booking.bookingNumber,
          bookingGroupId,
          type: 'RCTI',
          customerGrossCollection: (booking.grossAmount + (booking.gstAmount || 0)).toString(),
          netArtistPayout: (booking.artistNetPayout || 0).toString(),
        },
      })
      const invoice = rctiInvoice.id

      // 2. Line item: Platform Facilitation Fee (20%) attached directly to this draft
      await stripe.invoiceItems.create({
        customer: artistCustomerId,
        invoice,
        amount: Math.round((booking.platformCommissionAmount || 0) * 100),
        currency: 'aud',
        description: `Platform Facilitation Fee (${booking.platformCommissionPercentage || 20}%) - Booking #${booking.bookingNumber}`,
        metadata: {
          bookingNumber: booking.bookingNumber,
          bookingGroupId,
          type: 'RCTI_PLATFORM_FEE',
        },
      })

      // 3. Line item: GST on Platform Facilitation Fee (10%)
      if (booking.platformCommissionGst > 0) {
        await stripe.invoiceItems.create({
          customer: artistCustomerId,
          invoice,
          amount: Math.round(booking.platformCommissionGst * 100),
          currency: 'aud',
          description: 'GST on Platform Facilitation Fee (10%)',
          metadata: {
            bookingNumber: booking.bookingNumber,
            bookingGroupId,
            type: 'RCTI_PLATFORM_FEE_GST',
          },
        })
      }

      let finalized = await stripe.invoices.finalizeInvoice(rctiInvoice.id)

      // Mark paid out of band (deducted directly from gross customer collection during payout)
      try {
        finalized = await stripe.invoices.pay(finalized.id, { paid_out_of_band: true })
      } catch (e: any) {
        // safe fallback
      }

      if (!finalized.hosted_invoice_url || !finalized.invoice_pdf) {
        finalized = await stripe.invoices.retrieve(finalized.id)
      }

      booking.artistStripeInvoiceId = finalized.id
      booking.artistStripeInvoiceUrl = finalized.hosted_invoice_url || null
      booking.artistStripeInvoicePdf = finalized.invoice_pdf || null
      await Booking.findByIdAndUpdate(booking._id, {
        artistStripeInvoiceId: finalized.id,
        artistStripeInvoiceUrl: finalized.hosted_invoice_url || null,
        artistStripeInvoicePdf: finalized.invoice_pdf || null,
      })

      return {
        artistStripeInvoiceId: finalized.id,
        artistStripeInvoiceUrl: finalized.hosted_invoice_url,
        artistStripeInvoicePdf: finalized.invoice_pdf,
      }
    } catch (err: any) {
      logger.error(`[Stripe Invoice] Failed to issue Artist RCTI invoice: ${err?.message}`)
      return null
    }
  })()

  artistRctiLocks.set(lockKey, task)
  try {
    return await task
  } finally {
    if (artistRctiLocks.get(lockKey) === task) {
      artistRctiLocks.delete(lockKey)
    }
  }
}

/**
 * Get 80% Balance Payment Receipt for Customer
 */
const getBookingReceipt = async (user: IUser, bookingId: string) => {
  const booking = await Booking.findById(bookingId)
    .populate('service')
    .populate('services')
    .populate('artist', 'name email profilePicture phone')
    .populate('customer', 'name email profilePicture phone')

  if (!booking) {
    throw new AppError(httpStatus.NOT_FOUND, 'Booking not found')
  }

  const isCustomer = booking.customer._id.toString() === user._id.toString()
  const isAdmin = user.role === 'admin' || user.role === 'super_admin'

  if (!isCustomer && !isAdmin) {
    throw new AppError(httpStatus.FORBIDDEN, 'Access denied to this payment receipt')
  }

  if (booking.balancePayment.status !== PAYMENT_STAGE_STATUS.CAPTURED) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Balance payment is not yet captured. Final receipt is generated once the 80% balance is settled.'
    )
  }

  const artistProfile = await ArtistProfile.findOne({
    user: booking.artist._id || booking.artist,
  }).lean()
  ;(booking as any).artistProfile = artistProfile

  return generateBalancePaymentReceipt(booking)
}

/**
 * Get official Recipient Created Tax Invoice (RCTI) for Artist
 */
const getArtistInvoice = async (user: IUser, bookingId: string) => {
  const booking = await Booking.findById(bookingId)
    .populate('service')
    .populate('services')
    .populate('artist', 'name email profilePicture phone')
    .populate('customer', 'name email profilePicture phone')

  if (!booking) {
    throw new AppError(httpStatus.NOT_FOUND, 'Booking not found')
  }

  const isArtist = booking.artist._id.toString() === user._id.toString()
  const isAdmin = user.role === 'admin' || user.role === 'super_admin'

  if (!isArtist && !isAdmin) {
    throw new AppError(httpStatus.FORBIDDEN, 'Access denied to this artist invoice')
  }

  // Ensure Artist RCTI Stripe Invoice is issued and finalized if missing URL/PDF
  if (
    booking.balancePayment.status === PAYMENT_STAGE_STATUS.CAPTURED &&
    (!booking.artistStripeInvoiceId ||
      !booking.artistStripeInvoiceUrl ||
      !booking.artistStripeInvoicePdf)
  ) {
    await issueArtistRctiStripeInvoice(booking)
  }

  const artistProfile = await ArtistProfile.findOne({
    user: booking.artist._id || booking.artist,
  }).lean()
  ;(booking as any).artistProfile = artistProfile

  return generateArtistRctiInvoice(booking)
}

/**
 * Get single booking detailed ATO-compliant tax invoice
 */
const getBookingInvoice = async (user: IUser, bookingId: string) => {
  const booking = await Booking.findById(bookingId)
    .populate('service')
    .populate('services')
    .populate('artist', 'name email profilePicture phone')
    .populate('customer', 'name email profilePicture phone')
    .populate('address')
    .populate('promoCode', 'promotionName promoCode discountType discountValue')

  if (!booking) {
    throw new AppError(httpStatus.NOT_FOUND, 'Booking not found')
  }

  const isCustomer = booking.customer._id.toString() === user._id.toString()
  const isArtist = booking.artist._id.toString() === user._id.toString()
  const isAdmin = user.role === 'admin' || user.role === 'super_admin'

  if (!isCustomer && !isArtist && !isAdmin) {
    throw new AppError(httpStatus.FORBIDDEN, 'Access denied to this booking invoice')
  }

  if (
    booking.initialPayment?.status === PAYMENT_STAGE_STATUS.CAPTURED &&
    (!booking.stripeInvoiceId || !booking.stripeInvoiceUrl || !booking.stripeInvoicePdf)
  ) {
    await issueCustomerStripeInvoice(booking)
  }

  const artistProfile = await ArtistProfile.findOne({
    user: booking.artist._id || booking.artist,
  }).lean()
  ;(booking as any).artistProfile = artistProfile

  const platformSettings = await PlatformSettings.getSettings()
  return generateBookingTaxInvoice(booking, platformSettings?.gstPercentage ?? 10)
}

/**
 * Artist accepts a requested booking
 */
const acceptBooking = async (user: IUser, bookingId: string) => {
  const booking = await Booking.findById(bookingId)
  if (!booking) {
    throw new AppError(httpStatus.NOT_FOUND, 'Booking not found')
  }

  const isArtist = booking.artist.toString() === user._id.toString()
  const isAdmin = user.role === 'admin' || user.role === 'super_admin'
  if (!isArtist && !isAdmin) {
    throw new AppError(httpStatus.FORBIDDEN, 'Only the assigned artist can accept this booking')
  }

  if (booking.status !== BOOKING_STATUS.REQUESTED) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `Cannot accept booking with status '${booking.status}'`
    )
  }

  booking.status = BOOKING_STATUS.ACCEPTED
  await booking.save()

  await recordBookingHistory({
    booking: booking._id,
    bookingNumber: booking.bookingNumber,
    status: BOOKING_STATUS.ACCEPTED,
    milestone: BOOKING_TIMELINE_MILESTONE.ARTIST_ACCEPTED,
    title: 'Artist Accepted',
    description: 'Artist accepted the booking request',
    performedBy: user._id,
    performedByRole: (user.role as any) || 'artist',
  })

  // Notify customer
  try {
    await notificationServices.sendNotification({
      recipient: booking.customer,
      sender: user._id,
      senderName: user.name,
      senderPicture: user.profileImage,
      title: 'Booking Accepted',
      message: `${user.name} has accepted your booking #${booking.bookingNumber}`,
      type: NOTIFICATION_TYPE.BOOKING_ACCEPTED,
      bookingId: booking._id,
      bookingNumber: booking.bookingNumber,
      actionUrl: `/bookings/${booking._id}`,
    })
  } catch (notifErr) {
    logger.warn('[Booking Notification] Failed to notify customer:', notifErr)
  }

  return booking
}

/**
 * Customer confirms booking payment (20% deposit) after artist has accepted the requested booking
 */
const confirmBookingPayment = async (
  user: IUser,
  bookingId: string,
  input: { paymentMethodId?: string; usePlatformCredit?: boolean }
) => {
  const booking = await Booking.findById(bookingId).populate('service')
  if (!booking) {
    throw new AppError(httpStatus.NOT_FOUND, 'Booking not found')
  }

  if (booking.customer.toString() !== user._id.toString()) {
    throw new AppError(httpStatus.FORBIDDEN, 'You are not authorized to confirm this booking')
  }

  const isPayable =
    booking.status === BOOKING_STATUS.ACCEPTED ||
    (booking.status === BOOKING_STATUS.RESCHEDULED &&
      booking.initialPayment?.status !== PAYMENT_STAGE_STATUS.CAPTURED)

  if (!isPayable) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `Cannot confirm payment for booking with status '${booking.status}'. Booking must be accepted by artist first.`
    )
  }

  if (booking.initialPayment?.status === PAYMENT_STAGE_STATUS.CAPTURED) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Initial deposit has already been paid for this booking.'
    )
  }

  const artistProfile = await ArtistProfile.findOne({ user: booking.artist })
  const promoDoc = booking.promoCode ? await PromoCode.findById(booking.promoCode) : null
  const wallet = await walletServices.getMyWallet(user._id)
  const platformSettings = await PlatformSettings.getSettings()
  const platformCommissionPercent = platformSettings?.platformPercentage ?? 20
  const gstPercent = platformSettings?.gstPercentage ?? 10
  const stripeGstTaxRateId = booking.stripeGstTaxRateId || platformSettings?.stripeGstTaxRateId

  const useCredit =
    input.usePlatformCredit !== undefined
      ? Boolean(input.usePlatformCredit)
      : booking.platformCreditApplied > 0

  const breakdown = calculateBookingBreakdown({
    servicePrice: booking.servicePrice,
    travelFee: booking.travelFee,
    parkingFee: booking.parkingFee,
    isArtistGstRegistered: artistProfile?.isGstRegistered ?? false,
    promoCode: promoDoc,
    usePlatformCredit: useCredit,
    availableWalletCredit: wallet.balance,
    platformCommissionPercent,
    gstPercent,
  })

  // 1. Resolve Stripe Customer
  if (!user.stripeCustomerId) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Stripe customer not found. Please setup a payment method first.'
    )
  }
  const stripeCustomerId = user.stripeCustomerId

  // 2. Resolve Payment Method
  let effectivePaymentMethodId: string | undefined
  if (input.paymentMethodId) {
    const existingCard = await PaymentMethod.findOne(
      mongoose.isValidObjectId(input.paymentMethodId)
        ? { _id: input.paymentMethodId }
        : { stripePaymentMethodId: input.paymentMethodId }
    )
    if (!existingCard) {
      throw new AppError(
        httpStatus.NOT_FOUND,
        'Payment method is not listed in the database. Please provide a valid saved payment method.'
      )
    }
    if (existingCard.user.toString() !== user._id.toString()) {
      throw new AppError(
        httpStatus.FORBIDDEN,
        'Selected payment method is not listed under your account.'
      )
    }
    effectivePaymentMethodId = existingCard.stripePaymentMethodId
  } else if (booking.stripePaymentMethodId) {
    const bookedCard = await PaymentMethod.findOne({
      stripePaymentMethodId: booking.stripePaymentMethodId,
      user: user._id,
    })
    if (bookedCard) {
      effectivePaymentMethodId = bookedCard.stripePaymentMethodId
    }
  }

  if (breakdown.initialDepositAmount > 0 && !effectivePaymentMethodId) {
    const defaultCard = await PaymentMethod.findOne({ user: user._id, isDefault: true })
    if (!defaultCard) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'Payment method required to pay initial booking deposit.'
      )
    }
    effectivePaymentMethodId = defaultCard.stripePaymentMethodId
  }

  // 3. Debit wallet credit if applied
  if (breakdown.platformCreditApplied > 0) {
    await walletServices.debitUserWallet({
      userId: user._id,
      amount: breakdown.platformCreditApplied,
      source: WALLET_SOURCE.BOOKING_PAYMENT,
      bookingId: booking._id,
      bookingGroupId: booking.bookingGroupId || undefined,
      description: `Platform credit applied to confirmed booking #${booking.bookingNumber}`,
    })
  }

  // 4. Charge 20% Deposit via Stripe
  let stripePaymentIntentId: string | undefined
  let clientSecret: string | undefined
  let initialStatus: 'pending' | 'captured' = 'pending'

  if (breakdown.initialDepositAmount > 0 && effectivePaymentMethodId) {
    try {
      const piParams: Stripe.PaymentIntentCreateParams = {
        amount: Math.round(breakdown.initialDepositAmount * 100),
        currency: 'aud',
        customer: stripeCustomerId,
        payment_method: effectivePaymentMethodId,
        confirm: true,
        off_session: true,
        automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
        ...(booking.bookingGroupId ? { transfer_group: booking.bookingGroupId } : {}),
        metadata: {
          bookingNumber: booking.bookingNumber,
          bookingGroupId: booking.bookingGroupId || '',
          userId: user._id.toString(),
          artistId: booking.artist.toString(),
          type: PAYMENT_TRANSACTION_TYPE.INITIAL_20,
          gstPercentage: gstPercent.toString(),
          gstAmount: breakdown.serviceGst.toString(),
          stripeGstTaxRateId: stripeGstTaxRateId || '',
        },
      }

      const paymentIntent = await stripe.paymentIntents.create(piParams)
      stripePaymentIntentId = paymentIntent.id
      clientSecret = paymentIntent.client_secret || undefined

      if (paymentIntent.status === 'succeeded') {
        initialStatus = 'captured'
      }
    } catch (paymentErr: any) {
      if (breakdown.platformCreditApplied > 0) {
        await walletServices.rollbackDebit(
          user._id,
          breakdown.platformCreditApplied,
          booking._id,
          'Initial deposit payment failed - credit reversed'
        )
      }
      throw new AppError(
        httpStatus.BAD_REQUEST,
        `Payment failed: ${paymentErr?.message || 'Card declined'}`
      )
    }
  } else {
    // 100% covered by wallet / promo
    initialStatus = 'captured'
  }

  if (initialStatus !== 'captured') {
    throw new AppError(httpStatus.BAD_REQUEST, 'Deposit payment could not be captured.')
  }

  // 5. Increment promo code usage if applied
  if (promoDoc && breakdown.discountAmount > 0) {
    await PromoCode.findByIdAndUpdate(promoDoc._id, { $inc: { usageCount: 1 } })
  }

  // 6. Update Booking
  booking.status = BOOKING_STATUS.CONFIRMED
  booking.platformCreditApplied = breakdown.platformCreditApplied
  booking.totalBookingPrice = breakdown.totalBookingPrice
  booking.initialPayment.amount = breakdown.initialDepositAmount
  booking.initialPayment.status = PAYMENT_STAGE_STATUS.CAPTURED
  booking.initialPayment.stripePaymentIntentId = stripePaymentIntentId || null
  booking.initialPayment.paidAt = new Date()
  booking.balancePayment.amount = breakdown.balanceDueAmount
  booking.stripeCustomerId = stripeCustomerId
  if (effectivePaymentMethodId) {
    booking.stripePaymentMethodId = effectivePaymentMethodId
  }
  booking.platformCommissionPercentage = breakdown.platformCommissionPercentage
  booking.platformCommissionAmount = breakdown.platformCommissionAmount
  booking.platformCommissionGst = breakdown.platformCommissionGst
  booking.stripeInitialFee = breakdown.stripeInitialFee
  booking.stripeBalanceFee = breakdown.stripeBalanceFee
  booking.artistNetPayout = breakdown.artistNetPayout

  await booking.save()

  // 7. Issue Stripe Tax Invoice ONLY after payment succeeds
  await issueCustomerStripeInvoice(booking)

  // 8. Create PaymentTransaction audit record
  const txnPayload: any = {
    transactionId: `TXN-${booking.bookingNumber}-01`,
    booking: booking._id,
    bookingGroupId: booking.bookingGroupId,
    user: user._id,
    artist: booking.artist,
    type: PAYMENT_TRANSACTION_TYPE.INITIAL_20,
    gateway:
      breakdown.platformCreditApplied > 0 ? PAYMENT_GATEWAY.MIXED : PAYMENT_GATEWAY.STRIPE_CONNECT,
    status: PAYMENT_STATUS.SUCCEEDED,
    currency: 'AUD',
    amount: breakdown.initialDepositAmount,
    platformCreditUsed: breakdown.platformCreditApplied,
    marketplaceFee: breakdown.platformCommissionAmount,
    marketplaceFeeGst: breakdown.platformCommissionGst,
    stripeFeeBorne: breakdown.stripeInitialFee,
    artistNetShare: 0,
  }
  if (stripePaymentIntentId) {
    txnPayload.stripePaymentIntentId = stripePaymentIntentId
  }
  await PaymentTransaction.create(txnPayload)

  await recordBookingHistory({
    booking: booking._id,
    bookingNumber: booking.bookingNumber,
    status: BOOKING_STATUS.CONFIRMED,
    milestone: BOOKING_TIMELINE_MILESTONE.PAYMENT_COMPLETED,
    title: 'Deposit Paid & Confirmed',
    description: `Customer paid 20% deposit ($${breakdown.initialDepositAmount} AUD)`,
    performedBy: user._id,
    performedByRole: 'customer',
  })

  return {
    booking,
    clientSecret,
    breakdown,
  }
}

/**
 * Artist declines a booking request
 */
const declineBooking = async (user: IUser, bookingId: string, reason?: string) => {
  const booking = await Booking.findById(bookingId)
  if (!booking) {
    throw new AppError(httpStatus.NOT_FOUND, 'Booking not found')
  }

  const isArtist = booking.artist.toString() === user._id.toString()
  const isAdmin = user.role === 'admin' || user.role === 'super_admin'
  if (!isArtist && !isAdmin) {
    throw new AppError(httpStatus.FORBIDDEN, 'Only the assigned artist can decline this booking')
  }

  if (
    booking.status === BOOKING_STATUS.COMPLETED ||
    booking.status === BOOKING_STATUS.CANCELLED ||
    booking.status === BOOKING_STATUS.DECLINED
  ) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `Cannot decline booking that is already '${booking.status}'`
    )
  }

  booking.status = BOOKING_STATUS.DECLINED
  booking.cancellationReason = reason || 'Declined by artist'
  booking.cancelledAt = new Date()
  booking.cancelledBy = user._id as any
  booking.cancelledByRole = 'artist'

  const wasInitialCaptured = booking.initialPayment.status === PAYMENT_STAGE_STATUS.CAPTURED

  // Full refund of customer initial deposit if captured
  if (wasInitialCaptured && booking.initialPayment.stripePaymentIntentId) {
    try {
      await stripe.refunds.create({
        payment_intent: booking.initialPayment.stripePaymentIntentId,
        reason: 'requested_by_customer',
      })
      booking.initialPayment.status = PAYMENT_STAGE_STATUS.REFUNDED
    } catch (refundErr: any) {
      logger.error(`[Decline Booking] Stripe refund error: ${refundErr?.message}`)
    }
  }

  // Restore customer platform credits if used
  if (booking.platformCreditApplied > 0) {
    await walletServices.creditUserWallet({
      userId: booking.customer as any,
      amount: booking.platformCreditApplied,
      source: WALLET_SOURCE.BOOKING_ROLLBACK,
      bookingId: booking._id,
      bookingGroupId: booking.bookingGroupId,
      description: `Booking #${booking.bookingNumber} declined by artist - platform credit restored`,
    })
  }

  // Restore promo code usage count only if it was incremented on deposit capture
  if (booking.promoCode && wasInitialCaptured) {
    await PromoCode.findByIdAndUpdate(booking.promoCode, {
      $inc: { usageCount: -1 },
    })
  }

  await booking.save()

  await recordBookingHistory({
    booking: booking._id,
    bookingNumber: booking.bookingNumber,
    status: BOOKING_STATUS.DECLINED,
    milestone: BOOKING_TIMELINE_MILESTONE.DECLINED,
    title: 'Booking Declined',
    description: reason || 'Booking declined by artist',
    performedBy: user._id,
    performedByRole: (user.role as any) || 'artist',
    note: reason,
  })

  // Notify customer
  try {
    await notificationServices.sendNotification({
      recipient: booking.customer,
      sender: user._id,
      senderName: user.name,
      senderPicture: user.profileImage,
      title: 'Booking Declined',
      message: `${user.name} could not accept booking #${booking.bookingNumber}${reason ? ': ' + reason : ''}`,
      type: NOTIFICATION_TYPE.BOOKING_DECLINED,
      bookingId: booking._id,
      bookingNumber: booking.bookingNumber,
      actionUrl: `/bookings/${booking._id}`,
    })
  } catch (notifErr) {
    logger.warn('[Booking Notification] Failed to notify customer:', notifErr)
  }

  return booking
}

/**
 * Artist completes a service (proof photos, products used, working time, notes, signature)
 */
const completeBooking = async (
  user: IUser,
  bookingId: string,
  payload: any,
  files?: Express.Multer.File[]
) => {
  const booking = await Booking.findById(bookingId).populate('service').populate('services')
  if (!booking) {
    throw new AppError(httpStatus.NOT_FOUND, 'Booking not found')
  }

  const isArtist = booking.artist.toString() === user._id.toString()
  const isAdmin = user.role === 'admin' || user.role === 'super_admin'
  if (!isArtist && !isAdmin) {
    throw new AppError(httpStatus.FORBIDDEN, 'Only the assigned artist can complete this booking')
  }

  if (
    booking.status === BOOKING_STATUS.COMPLETED ||
    booking.status === BOOKING_STATUS.CANCELLED ||
    booking.status === BOOKING_STATUS.DECLINED
  ) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `Cannot complete booking with status '${booking.status}'`
    )
  }

  let proofPhotoUrls: string[] = []
  if (files && files.length > 0) {
    const uploaded = await uploadMultipleFileToS3(files, AWS_FOLDER_NAMES.ProofPhotos)
    proofPhotoUrls = uploaded.map((u) => u.url).filter((url): url is string => Boolean(url))
  }

  let finalPayload = payload
  if (typeof payload?.data === 'string') {
    try {
      finalPayload = JSON.parse(payload.data)
    } catch (e) {
      // safe fallback
    }
  }

  const serviceName =
    Array.isArray((booking as any).services) && (booking as any).services.length > 0
      ? (booking as any).services.map((s: any) => s.name).join(', ')
      : (booking.service as any)?.name || 'Beauty Service'

  booking.completionDetails = {
    servicesPerformed: finalPayload.servicesPerformed || serviceName,
    productsUsed: finalPayload.productsUsed || null,
    totalWorkingTime: finalPayload.totalWorkingTime || `${booking.durationMinutes} mins`,
    specialNotes: finalPayload.specialNotes || null,
    proofPhotos:
      proofPhotoUrls.length > 0 ? proofPhotoUrls : booking.completionDetails?.proofPhotos || [],
    customerSignature:
      finalPayload.customerSignature || booking.completionDetails?.customerSignature || null,
    completedAt: new Date(),
    signedAt: booking.completionDetails?.signedAt || null,
  }

  booking.status = BOOKING_STATUS.COMPLETED
  await booking.save()

  await recordBookingHistory({
    booking: booking._id,
    bookingNumber: booking.bookingNumber,
    status: BOOKING_STATUS.COMPLETED,
    milestone: BOOKING_TIMELINE_MILESTONE.SERVICE_COMPLETED,
    title: 'Service Completed',
    description: 'Artist completed service and uploaded proof',
    performedBy: user._id,
    performedByRole: (user.role as any) || 'artist',
    metadata: {
      servicesPerformed: finalPayload.servicesPerformed,
      totalWorkingTime: finalPayload.totalWorkingTime,
      proofPhotosCount: proofPhotoUrls.length,
    },
  })

  // Notify customer with review prompt
  try {
    await notificationServices.sendNotification({
      recipient: booking.customer,
      sender: user._id,
      senderName: user.name,
      senderPicture: user.profileImage,
      title: 'Order complete',
      message: `Your order #${booking.bookingNumber} is complete. Give a short review!`,
      type: NOTIFICATION_TYPE.ORDER_COMPLETE,
      bookingId: booking._id,
      bookingNumber: booking.bookingNumber,
      actionUrl: `/reviews/write?bookingId=${booking._id}`,
    })
  } catch (notifErr) {
    logger.warn('[Booking Notification] Failed to notify customer:', notifErr)
  }

  return booking
}

/**
 * Customer signs for a booking service completion
 */
const customerSign = async (
  user: IUser,
  bookingId: string,
  payload: {
    customerSignature: string
  }
) => {
  const booking = await Booking.findById(bookingId)
  if (!booking) {
    throw new AppError(httpStatus.NOT_FOUND, 'Booking not found')
  }

  const isCustomer = booking.customer.toString() === user._id.toString()
  const isAdmin = user.role === 'admin' || user.role === 'super_admin'
  if (!isCustomer && !isAdmin) {
    throw new AppError(httpStatus.FORBIDDEN, 'Only the customer can sign for this booking')
  }

  if (
    booking.status === BOOKING_STATUS.CANCELLED ||
    booking.status === BOOKING_STATUS.DECLINED
  ) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `Cannot sign a booking that is '${booking.status}'`
    )
  }

  if (!booking.completionDetails) {
    booking.completionDetails = {
      servicesPerformed: null,
      productsUsed: null,
      totalWorkingTime: null,
      specialNotes: null,
      proofPhotos: [],
      customerSignature: null,
      completedAt: null,
      signedAt: null,
    } as any
  }

  const wasAlreadySigned = Boolean(booking.completionDetails?.signedAt)
  booking.completionDetails!.customerSignature = payload.customerSignature
  booking.completionDetails!.signedAt = new Date()

  // Release held artist payout to Connected Account upon customer sign
  const netPayout = booking.artistNetPayout || 0
  const txnId = `TXN-${booking.bookingNumber}-SIGN-PAYOUT`
  const existingPayoutTxn = await PaymentTransaction.findOne({ transactionId: txnId })
  if (existingPayoutTxn?.status === PAYMENT_STATUS.SUCCEEDED || existingPayoutTxn?.stripeTransferId) {
    booking.completionDetails!.payoutTransferredAt =
      booking.completionDetails!.payoutTransferredAt || new Date()
  }

  if (!booking.completionDetails!.payoutTransferredAt && netPayout > 0) {
    let stripeTransferId: string | undefined
    let transferFailureReason: string | undefined
    const artistAccount = await Account.findOne({ user: booking.artist })
    if (artistAccount?.account) {
      try {
        const transfer = await stripe.transfers.create({
          amount: Math.round(netPayout * 100),
          currency: 'aud',
          destination: artistAccount.account,
          transfer_group: `GRP-${booking.bookingNumber}`,
          metadata: {
            bookingId: booking._id.toString(),
            type: 'CUSTOMER_SIGN_ARTIST_PAYOUT',
          },
        })
        stripeTransferId = transfer.id
        booking.completionDetails!.payoutTransferredAt = new Date()
        logger.info(
          `[Customer Sign Payout] Released $${netPayout} AUD to artist ${booking.artist} for booking ${booking.bookingNumber}`
        )
      } catch (err: any) {
        if (err?.message?.includes('service agreement') && configs.nodeEnv !== 'production') {
          booking.completionDetails!.payoutTransferredAt = new Date()
          logger.warn(
            `[Customer Sign Payout Sandbox Bypass] Cross-border US->AU transfer skipped in ${configs.nodeEnv} mode (Platform is US, Artist is AU 'full' agreement). Recorded payout of $${netPayout} AUD for testing.`
          )
        } else {
          transferFailureReason = err?.message || 'Artist payout transfer pending available balance'
          logger.warn(
            `[Customer Sign Payout Queued] Transfer pending for booking ${booking.bookingNumber}: ${transferFailureReason}`
          )
        }
      }
    } else {
      transferFailureReason = 'Artist Stripe Connected Account not found'
    }

    const isTransferred = Boolean(booking.completionDetails!.payoutTransferredAt)
    await PaymentTransaction.findOneAndUpdate(
      { transactionId: txnId },
      {
        $set: {
          status: isTransferred ? PAYMENT_STATUS.SUCCEEDED : PAYMENT_STATUS.PENDING,
          ...(stripeTransferId ? { stripeTransferId } : {}),
          failureReason: isTransferred ? null : transferFailureReason,
          artistNetShare: netPayout,
        },
        $setOnInsert: {
          transactionId: txnId,
          booking: booking._id,
          bookingGroupId: `GRP-${booking.bookingNumber}`,
          user: booking.customer,
          artist: booking.artist,
          type: PAYMENT_TRANSACTION_TYPE.STRIPE_TRANSFER,
          gateway: PAYMENT_GATEWAY.STRIPE_CONNECT,
          currency: 'AUD',
          amount: booking.totalBookingPrice || booking.grossAmount || 0,
          marketplaceFee: booking.platformCommissionAmount || 0,
          marketplaceFeeGst: booking.platformCommissionGst || 0,
          stripeFeeBorne: booking.stripeBalanceFee || 0,
        },
      },
      { upsert: true, new: true }
    )
  }

  await booking.save()

  if (!wasAlreadySigned) {
    await recordBookingHistory({
      booking: booking._id,
      bookingNumber: booking.bookingNumber,
      status: booking.status,
      milestone: BOOKING_TIMELINE_MILESTONE.BOOKING_CLOSED,
      title: 'Booking Closed',
      description: 'Customer verified and signed off on completed service',
      performedBy: user._id,
      performedByRole: 'customer',
    })
  }

  return booking
}

/**
 * Customer or Artist requests to reschedule a booking
 */
const requestReschedule = async (
  user: IUser,
  bookingId: string,
  payload: {
    newDate: string
    newStartTime: string
    reason: string
    message?: string
  }
) => {
  const booking = await Booking.findById(bookingId)
  if (!booking) {
    throw new AppError(httpStatus.NOT_FOUND, 'Booking not found')
  }

  const isCustomer = booking.customer.toString() === user._id.toString()
  const isArtist = booking.artist.toString() === user._id.toString()
  const isAdmin = user.role === 'admin' || user.role === 'super_admin'

  if (!isCustomer && !isArtist && !isAdmin) {
    throw new AppError(httpStatus.FORBIDDEN, 'Access denied to reschedule this booking')
  }

  if (
    booking.status === BOOKING_STATUS.COMPLETED ||
    booking.status === BOOKING_STATUS.CANCELLED ||
    booking.status === BOOKING_STATUS.DECLINED
  ) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `Cannot reschedule a booking that is '${booking.status}'`
    )
  }

  const requestedDateMoment = moment(payload.newDate, 'YYYY-MM-DD').startOf('day')
  if (requestedDateMoment.isBefore(moment().startOf('day'))) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Rescheduled date cannot be in the past')
  }

  const startMoment = moment(payload.newStartTime.trim(), [
    'HH:mm',
    'hh:mm A',
    'h:mm A',
    'hh:mma',
    'h:mma',
  ])
  if (!startMoment.isValid()) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Invalid newStartTime format. Use AM/PM format (e.g. 10:00 AM) or HH:mm'
    )
  }
  const normalizedNewStartTime = startMoment.format('HH:mm')
  const newEndTime = startMoment.clone().add(booking.durationMinutes, 'minutes').format('HH:mm')

  // 1. Cannot reschedule to the exact same appointment date and time as currently scheduled
  const currentScheduledDate = moment(booking.bookingDate).format('YYYY-MM-DD')
  if (currentScheduledDate === payload.newDate && booking.startTime === normalizedNewStartTime) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'The requested reschedule date and time is identical to the current scheduled appointment.'
    )
  }

  // 2. Cannot send duplicate reschedule request if one is already pending for this same date and time
  if (booking.rescheduleRequest && booking.rescheduleRequest.status === 'pending') {
    const existingRescheduleDate = moment(booking.rescheduleRequest.newDate).format('YYYY-MM-DD')
    if (
      existingRescheduleDate === payload.newDate &&
      booking.rescheduleRequest.newStartTime === normalizedNewStartTime
    ) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'A reschedule request for this exact date and time is already pending response.'
      )
    }
  }

  // 3. Artist Blocked Date check
  const blockedDate = await ArtistBlockedDate.findOne({
    user: booking.artist,
    date: payload.newDate,
  })
  if (blockedDate) {
    throw new AppError(
      httpStatus.CONFLICT,
      `The artist is unavailable on this date (${blockedDate.reason || 'Blocked date'}).`
    )
  }

  // 4. Artist Weekly Working Hours, Breaks, Vacation & Limit checks
  const availability = await Availability.findOne({ user: booking.artist })
  if (availability) {
    // Vacation check
    if (
      availability.isVacationEnabled &&
      availability.vacationStartDate &&
      availability.vacationEndDate
    ) {
      const vStart = moment(availability.vacationStartDate).format('YYYY-MM-DD')
      const vEnd = moment(availability.vacationEndDate).format('YYYY-MM-DD')
      if (payload.newDate >= vStart && payload.newDate <= vEnd) {
        throw new AppError(
          httpStatus.CONFLICT,
          availability.vacationMessage || 'The artist is currently on vacation during this date.'
        )
      }
    }

    // Working day check
    const dayNameMapping: Record<number, string> = {
      0: 'sunday',
      1: 'monday',
      2: 'tuesday',
      3: 'wednesday',
      4: 'thursday',
      5: 'friday',
      6: 'saturday',
    }
    const dayName = dayNameMapping[requestedDateMoment.day()] as keyof typeof availability.weeklySchedule
    const daySchedule = availability.weeklySchedule?.[dayName]

    if (!daySchedule || !daySchedule.isWorkingDay || !daySchedule.startTime || !daySchedule.endTime) {
      throw new AppError(
        httpStatus.CONFLICT,
        'The artist does not have working hours scheduled on this day of the week.'
      )
    }

    // Working hours bounds check
    if (normalizedNewStartTime < daySchedule.startTime || newEndTime > daySchedule.endTime) {
      throw new AppError(
        httpStatus.CONFLICT,
        `Requested slot is outside the artist's working hours (${daySchedule.startTime} - ${daySchedule.endTime}).`
      )
    }

    // Break time overlap check
    if (daySchedule.breakTimes && daySchedule.breakTimes.length > 0) {
      for (const b of daySchedule.breakTimes) {
        if (b.startTime && b.endTime) {
          if (b.startTime < newEndTime && b.endTime > normalizedNewStartTime) {
            throw new AppError(
              httpStatus.CONFLICT,
              `Requested slot overlaps with the artist's scheduled break (${b.startTime} - ${b.endTime}).`
            )
          }
        }
      }
    }

    // Daily maximum booking limit check
    if (availability.maxBookingPerDay) {
      const dailyCount = await Booking.countDocuments({
        _id: { $ne: booking._id },
        artist: booking.artist,
        bookingDate: requestedDateMoment.toDate(),
        status: {
          $in: [
            BOOKING_STATUS.REQUESTED,
            BOOKING_STATUS.ACCEPTED,
            BOOKING_STATUS.CONFIRMED,
            BOOKING_STATUS.IN_PROGRESS,
            BOOKING_STATUS.RESCHEDULED,
          ],
        },
      })
      if (dailyCount >= availability.maxBookingPerDay) {
        throw new AppError(
          httpStatus.CONFLICT,
          `The artist has already reached the maximum booking limit (${availability.maxBookingPerDay} bookings) for this day.`
        )
      }
    }
  }

  // 5. Conflicting booking check (any active booking on the artist's schedule)
  const conflict = await Booking.findOne({
    _id: { $ne: booking._id },
    artist: booking.artist,
    bookingDate: requestedDateMoment.toDate(),
    status: {
      $in: [
        BOOKING_STATUS.REQUESTED,
        BOOKING_STATUS.ACCEPTED,
        BOOKING_STATUS.CONFIRMED,
        BOOKING_STATUS.IN_PROGRESS,
        BOOKING_STATUS.RESCHEDULED,
      ],
    },
    startTime: { $lt: newEndTime },
    endTime: { $gt: normalizedNewStartTime },
  })

  if (conflict) {
    throw new AppError(
      httpStatus.CONFLICT,
      'The artist already has another booking during this requested time slot.'
    )
  }

  // 6. Conflicting pending reschedule request on another booking
  const pendingRescheduleConflict = await Booking.findOne({
    _id: { $ne: booking._id },
    artist: booking.artist,
    'rescheduleRequest.status': 'pending',
    'rescheduleRequest.newDate': requestedDateMoment.toDate(),
    'rescheduleRequest.newStartTime': { $lt: newEndTime },
    'rescheduleRequest.newEndTime': { $gt: normalizedNewStartTime },
  })

  if (pendingRescheduleConflict) {
    throw new AppError(
      httpStatus.CONFLICT,
      'Another booking already has a pending reschedule request during this requested time slot.'
    )
  }

  const requestedByRole = isArtist ? 'artist' : 'customer'

  booking.rescheduleRequest = {
    requestedBy: user._id as any,
    requestedByRole,
    newDate: requestedDateMoment.toDate(),
    newStartTime: normalizedNewStartTime,
    newEndTime,
    reason: payload.reason,
    message: payload.message || null,
    status: 'pending',
    createdAt: new Date(),
    respondedAt: null,
    declineReason: null,
  }

  await booking.save()

  // Notify opponent
  try {
    const opponentId = isArtist ? booking.customer : booking.artist
    await notificationServices.sendNotification({
      recipient: opponentId,
      sender: user._id,
      senderName: user.name,
      senderPicture: user.profileImage,
      title: 'Reschedule Requested',
      message: `${user.name} requested to reschedule booking #${booking.bookingNumber} to ${payload.newDate} at ${normalizedNewStartTime}`,
      type: NOTIFICATION_TYPE.BOOKING_RESCHEDULED,
      bookingId: booking._id,
      bookingNumber: booking.bookingNumber,
      actionUrl: `/bookings/${booking._id}`,
    })
  } catch (notifErr) {
    logger.warn('[Booking Notification] Failed to notify opponent of reschedule request:', notifErr)
  }

  return booking
}

/**
 * Opposite party responds to a reschedule request (accept or decline)
 */
const respondReschedule = async (
  user: IUser,
  bookingId: string,
  payload: {
    action: 'accept' | 'decline'
    declineReason?: string
  }
) => {
  const booking = await Booking.findById(bookingId)
  if (!booking) {
    throw new AppError(httpStatus.NOT_FOUND, 'Booking not found')
  }

  if (!booking.rescheduleRequest || booking.rescheduleRequest.status !== 'pending') {
    throw new AppError(httpStatus.BAD_REQUEST, 'No pending reschedule request on this booking')
  }

  const isCustomer = booking.customer.toString() === user._id.toString()
  const isArtist = booking.artist.toString() === user._id.toString()
  const isAdmin = user.role === 'admin' || user.role === 'super_admin'

  if (booking.rescheduleRequest.requestedByRole === 'customer') {
    if (!isArtist && !isAdmin) {
      throw new AppError(
        httpStatus.FORBIDDEN,
        'Only the artist can respond to a customer reschedule request'
      )
    }
  } else if (booking.rescheduleRequest.requestedByRole === 'artist') {
    if (!isCustomer && !isAdmin) {
      throw new AppError(
        httpStatus.FORBIDDEN,
        'Only the customer can respond to an artist reschedule request'
      )
    }
  }

  if (payload.action === 'accept') {
    // Re-verify slot availability to prevent race conditions or intervening bookings
    const conflict = await Booking.findOne({
      _id: { $ne: booking._id },
      artist: booking.artist,
      bookingDate: booking.rescheduleRequest.newDate,
      status: {
        $in: [
          BOOKING_STATUS.REQUESTED,
          BOOKING_STATUS.ACCEPTED,
          BOOKING_STATUS.CONFIRMED,
          BOOKING_STATUS.IN_PROGRESS,
          BOOKING_STATUS.RESCHEDULED,
        ],
      },
      startTime: { $lt: booking.rescheduleRequest.newEndTime },
      endTime: { $gt: booking.rescheduleRequest.newStartTime },
    })

    if (conflict) {
      throw new AppError(
        httpStatus.CONFLICT,
        'Cannot accept reschedule: The artist already has another booking during this time slot.'
      )
    }

    booking.bookingDate = booking.rescheduleRequest.newDate
    booking.startTime = booking.rescheduleRequest.newStartTime
    booking.endTime = booking.rescheduleRequest.newEndTime
    booking.status = BOOKING_STATUS.RESCHEDULED
    booking.rescheduleRequest.status = 'accepted'
    booking.rescheduleRequest.respondedAt = new Date()

    // Recalculate 80% balance due date: 24 hours prior to rescheduled appointment
    const [startHour = '0', startMinute = '0'] = booking.startTime.split(':')
    const newAppointmentMoment = moment(booking.bookingDate).set({
      hour: parseInt(startHour, 10),
      minute: parseInt(startMinute, 10),
      second: 0,
      millisecond: 0,
    })
    booking.balancePayment.dueDate = newAppointmentMoment.clone().subtract(24, 'hours').toDate()
  } else {
    booking.rescheduleRequest.status = 'declined'
    booking.rescheduleRequest.respondedAt = new Date()
    booking.rescheduleRequest.declineReason = payload.declineReason || 'Reschedule request declined'
  }

  await booking.save()

  // Notify opponent of reschedule decision
  try {
    const opponentId = isCustomer ? booking.artist : booking.customer
    await notificationServices.sendNotification({
      recipient: opponentId,
      sender: user._id,
      senderName: user.name,
      senderPicture: user.profileImage,
      title: payload.action === 'accept' ? 'Reschedule Accepted' : 'Reschedule Declined',
      message:
        payload.action === 'accept'
          ? `${user.name} accepted the reschedule request for booking #${booking.bookingNumber}`
          : `${user.name} declined the reschedule request for booking #${booking.bookingNumber}`,
      type: NOTIFICATION_TYPE.BOOKING_RESCHEDULED,
      bookingId: booking._id,
      bookingNumber: booking.bookingNumber,
      actionUrl: `/bookings/${booking._id}`,
    })
  } catch (notifErr) {
    logger.warn('[Booking Notification] Failed to notify opponent of reschedule decision:', notifErr)
  }

  return booking
}

/**
 * Artist inbox and daily summary metrics (Figma Artist/15.png)
 */
const getArtistInboxSummary = async (user: IUser) => {
  const artistId = new mongoose.Types.ObjectId(user._id.toString())
  const todayStart = moment().startOf('day').toDate()
  const todayEnd = moment().endOf('day').toDate()

  const [todayStats, pendingCount, acceptedCount, upcomingCount] = await Promise.all([
    Booking.aggregate([
      {
        $match: {
          artist: artistId,
          bookingDate: { $gte: todayStart, $lte: todayEnd },
        },
      },
      {
        $group: {
          _id: null,
          totalToday: { $sum: 1 },
          requestsCount: {
            $sum: {
              $cond: [{ $eq: ['$status', BOOKING_STATUS.REQUESTED] }, 1, 0],
            },
          },
          confirmedCount: {
            $sum: {
              $cond: [{ $eq: ['$status', BOOKING_STATUS.CONFIRMED] }, 1, 0],
            },
          },
          completedCount: {
            $sum: {
              $cond: [{ $eq: ['$status', BOOKING_STATUS.COMPLETED] }, 1, 0],
            },
          },
          earningsToday: {
            $sum: {
              $cond: [
                {
                  $in: ['$status', [BOOKING_STATUS.COMPLETED, BOOKING_STATUS.CONFIRMED]],
                },
                '$artistNetPayout',
                0,
              ],
            },
          },
        },
      },
    ]),
    Booking.countDocuments({
      artist: artistId,
      status: BOOKING_STATUS.REQUESTED,
    }),
    Booking.countDocuments({
      artist: artistId,
      status: BOOKING_STATUS.ACCEPTED,
    }),
    Booking.countDocuments({
      artist: artistId,
      bookingDate: { $gte: todayStart },
      status: {
        $in: [BOOKING_STATUS.CONFIRMED, BOOKING_STATUS.IN_PROGRESS, BOOKING_STATUS.RESCHEDULED],
      },
    }),
  ])

  const stats = todayStats[0] || {
    totalToday: 0,
    requestsCount: 0,
    confirmedCount: 0,
    completedCount: 0,
    earningsToday: 0,
  }

  return {
    today: {
      date: moment().format('YYYY-MM-DD'),
      totalBookings: stats.totalToday,
      requestsCount: stats.requestsCount,
      confirmedCount: stats.confirmedCount,
      completedCount: stats.completedCount,
      estimatedEarnings: Number((stats.earningsToday || 0).toFixed(2)),
    },
    allTime: {
      pendingRequestsCount: pendingCount,
      upcomingBookingsCount: upcomingCount,
    },
  }
}

/**
 * Point 6 & 7: Artist reports Customer No-Show or Safety Refusal
 */
const reportCustomerNoShow = async (
  user: IUser,
  bookingId: string,
  payload: { reason?: string; isSafetyConcern?: boolean } = {}
) => {
  const booking = await Booking.findById(bookingId).populate('artist customer')
  if (!booking) {
    throw new AppError(httpStatus.NOT_FOUND, 'Booking not found')
  }

  const isArtist = booking.artist._id.toString() === user._id.toString()
  if (!isArtist) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      'Only the assigned artist can report a customer no-show'
    )
  }

  if (
    booking.status !== BOOKING_STATUS.CONFIRMED &&
    booking.status !== BOOKING_STATUS.IN_PROGRESS
  ) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `Cannot report no-show for a booking in '${booking.status}' status`
    )
  }

  // Attempt to capture remaining 80% balance if still pending
  if (
    booking.balancePayment.status === PAYMENT_STAGE_STATUS.PENDING &&
    booking.stripePaymentMethodId &&
    booking.balancePayment.amount > 0
  ) {
    try {
      const piParams: any = {
        amount: Math.round(booking.balancePayment.amount * 100),
        currency: 'aud',
        payment_method: booking.stripePaymentMethodId,
        off_session: true,
        confirm: true,
        transfer_group: `GRP-${booking.bookingNumber}`,
        metadata: {
          bookingNumber: booking.bookingNumber,
          bookingId: booking._id.toString(),
          type: 'NO_SHOW_BALANCE_CAPTURE',
        },
      }
      if (booking.stripeCustomerId) {
        piParams.customer = booking.stripeCustomerId
      }
      const pi = await stripe.paymentIntents.create(piParams)
      if (pi.status === 'succeeded') {
        booking.balancePayment.status = PAYMENT_STAGE_STATUS.CAPTURED
        booking.balancePayment.paidAt = new Date()
        booking.balancePayment.stripePaymentIntentId = pi.id
      }
    } catch (e: any) {
      logger.warn(`Failed to auto-charge balance for reported no-show: ${e?.message}`)
    }
  }

  booking.status = BOOKING_STATUS.NO_SHOW_PENDING
  booking.noShowDetails = {
    reportedBy: user._id,
    reportedAt: new Date(),
    reason:
      payload.reason ||
      (payload.isSafetyConcern ? 'Unsafe premises / safety refusal' : 'Customer failed to attend'),
    isSafetyConcern: Boolean(payload.isSafetyConcern),
    isApproved: false,
  }
  await booking.save()

  logger.info(
    `[No-Show Reported] Artist ${user._id} reported customer no-show for booking ${booking.bookingNumber}. Awaiting admin verification.`
  )

  return {
    message:
      'Customer no-show reported successfully. Admin verification is required before releasing the payout.',
    booking,
  }
}

/**
 * Point 6 & 7: Admin verifies Customer No-Show (Releases 100% protected payout to artist)
 */
const verifyCustomerNoShow = async (
  adminUser: IUser,
  bookingId: string,
  payload: { isApproved: boolean; adminNotes?: string }
) => {
  const booking = await Booking.findById(bookingId).populate('artist customer')
  if (!booking) {
    throw new AppError(httpStatus.NOT_FOUND, 'Booking not found')
  }

  if (booking.status !== BOOKING_STATUS.NO_SHOW_PENDING) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `Booking is not pending no-show verification (current status: ${booking.status})`
    )
  }

  if (!booking.noShowDetails) {
    throw new AppError(httpStatus.BAD_REQUEST, 'No no-show details found for this booking')
  }

  booking.noShowDetails.verifiedBy = adminUser._id
  booking.noShowDetails.verifiedAt = new Date()
  booking.noShowDetails.isApproved = payload.isApproved
  booking.noShowDetails.adminNotes = payload.adminNotes

  if (payload.isApproved) {
    booking.status = BOOKING_STATUS.NO_SHOW

    // Release 100% protected net payout to artist Stripe Connected Account!
    const artistAccount = await Account.findOne({ user: booking.artist._id })
    const netPayout = booking.artistNetPayout || 0
    let isTransferSuccessful = false
    let stripeTransferId: string | undefined
    let transferFailureReason: string | undefined

    if (artistAccount?.account && netPayout > 0) {
      try {
        const transfer = await stripe.transfers.create({
          amount: Math.round(netPayout * 100),
          currency: 'aud',
          destination: artistAccount.account,
          transfer_group: `GRP-${booking.bookingNumber}`,
          metadata: {
            bookingId: booking._id.toString(),
            type: 'NO_SHOW_ARTIST_PROTECTED_PAYOUT',
          },
        })
        isTransferSuccessful = true
        stripeTransferId = transfer.id
        logger.info(
          `[No-Show Verified] Released $${netPayout} AUD protected payout to artist ${booking.artist._id} for booking ${booking.bookingNumber}`
        )
      } catch (err: any) {
        if (err?.message?.includes('service agreement') && configs.nodeEnv !== 'production') {
          isTransferSuccessful = true
          logger.warn(
            `[No-Show Payout Sandbox Bypass] Cross-border US->AU transfer skipped in ${configs.nodeEnv} mode (${err.message}). Recorded payout of $${netPayout} AUD for testing.`
          )
        } else {
          transferFailureReason = err?.message || 'Artist payout transfer pending available balance'
          logger.warn(
            `[No-Show Payout Queued] Transfer pending for booking ${booking.bookingNumber}: ${transferFailureReason}`
          )
        }
      }
    } else if (netPayout > 0) {
      transferFailureReason = 'Artist Stripe Connected Account not found'
    }

    const noShowTxnId = `TXN-${booking.bookingNumber}-NO-SHOW-PAYOUT`
    await PaymentTransaction.findOneAndUpdate(
      { transactionId: noShowTxnId },
      {
        $set: {
          status: isTransferSuccessful ? PAYMENT_STATUS.SUCCEEDED : PAYMENT_STATUS.PENDING,
          ...(stripeTransferId ? { stripeTransferId } : {}),
          failureReason: isTransferSuccessful ? null : transferFailureReason,
          artistNetShare: netPayout,
        },
        $setOnInsert: {
          transactionId: noShowTxnId,
          booking: booking._id,
          bookingGroupId: `GRP-${booking.bookingNumber}`,
          user: booking.customer._id,
          artist: booking.artist._id,
          type: PAYMENT_TRANSACTION_TYPE.FULL_100,
          gateway: PAYMENT_GATEWAY.STRIPE_CONNECT,
          currency: 'AUD',
          amount: booking.totalBookingPrice || booking.grossAmount || 0,
          marketplaceFee: booking.platformCommissionAmount || 0,
          marketplaceFeeGst: booking.platformCommissionGst || 0,
          stripeFeeBorne: booking.stripeBalanceFee || 0,
        },
      },
      { upsert: true, new: true }
    )
  } else {
    booking.status = BOOKING_STATUS.CONFIRMED
  }

  await booking.save()

  return {
    message: payload.isApproved
      ? `Customer no-show verified and approved. Full payout of $${booking.artistNetPayout} AUD has been released to the artist.`
      : 'Customer no-show claim was rejected by admin.',
    booking,
  }
}

/**
 * Record a milestone or status change in the BookingHistory collection
 */
const recordBookingHistory = async (payload: {
  booking: mongoose.Types.ObjectId | string
  bookingNumber: string
  status: any
  milestone: string
  title: string
  description?: string | null | undefined
  performedBy?: mongoose.Types.ObjectId | string | null | undefined
  performedByRole?: 'customer' | 'artist' | 'admin' | 'system' | undefined
  note?: string | null | undefined
  metadata?: Record<string, any> | null | undefined
}) => {
  try {
    return await BookingHistory.create({
      booking: payload.booking,
      bookingNumber: payload.bookingNumber,
      status: payload.status,
      milestone: payload.milestone,
      title: payload.title,
      description: payload.description,
      performedBy: payload.performedBy || null,
      performedByRole: payload.performedByRole || 'system',
      note: payload.note,
      metadata: payload.metadata,
    })
  } catch (err: any) {
    logger.error(`[BookingHistory] Failed to record booking history: ${err?.message || err}`)
    return null
  }
}

/**
 * Retrieve booking timeline milestones and history log from BookingHistory table (Figma Admin/6.png)
 */
const getBookingTimelineFromHistory = async (booking: any) => {
  let historyItems = await BookingHistory.find({ booking: booking._id })
    .sort({ createdAt: 1 })
    .populate('performedBy', 'name email role profileImage')
    .lean()

  // Graceful backfill for existing bookings created before BookingHistory table was added
  if (historyItems.length === 0) {
    const initialHistories: any[] = []

    initialHistories.push({
      booking: booking._id,
      bookingNumber: booking.bookingNumber,
      status: BOOKING_STATUS.REQUESTED,
      milestone: BOOKING_TIMELINE_MILESTONE.BOOKING_CREATED,
      title: 'Booking Created',
      description: 'Booking was submitted by the customer',
      performedBy: booking.customer,
      performedByRole: 'customer',
      createdAt: booking.createdAt,
    })

    if (
      [
        BOOKING_STATUS.ACCEPTED,
        BOOKING_STATUS.CONFIRMED,
        BOOKING_STATUS.IN_PROGRESS,
        BOOKING_STATUS.COMPLETED,
        BOOKING_STATUS.RESCHEDULED,
      ].includes(booking.status)
    ) {
      initialHistories.push({
        booking: booking._id,
        bookingNumber: booking.bookingNumber,
        status: BOOKING_STATUS.ACCEPTED,
        milestone: BOOKING_TIMELINE_MILESTONE.ARTIST_ACCEPTED,
        title: 'Artist Accepted',
        description: 'Artist accepted the booking request',
        performedBy: booking.artist,
        performedByRole: 'artist',
        createdAt: booking.initialPayment?.paidAt || booking.updatedAt,
      })
    }

    if (
      booking.initialPayment?.status === PAYMENT_STAGE_STATUS.CAPTURED ||
      booking.balancePayment?.status === PAYMENT_STAGE_STATUS.CAPTURED
    ) {
      initialHistories.push({
        booking: booking._id,
        bookingNumber: booking.bookingNumber,
        status: booking.status,
        milestone: BOOKING_TIMELINE_MILESTONE.PAYMENT_COMPLETED,
        title: 'Payment Completed',
        description:
          booking.balancePayment?.status === PAYMENT_STAGE_STATUS.CAPTURED
            ? 'Remaining 80% balance payment captured'
            : '20% deposit captured, balance payment pending',
        performedBy: booking.customer,
        performedByRole: 'customer',
        createdAt:
          booking.balancePayment?.paidAt ||
          booking.initialPayment?.paidAt ||
          booking.updatedAt,
      })
    }

    if ([BOOKING_STATUS.IN_PROGRESS, BOOKING_STATUS.COMPLETED].includes(booking.status)) {
      initialHistories.push({
        booking: booking._id,
        bookingNumber: booking.bookingNumber,
        status: BOOKING_STATUS.IN_PROGRESS,
        milestone: BOOKING_TIMELINE_MILESTONE.SERVICE_STARTED,
        title: 'Service Started',
        description: 'Service delivery in progress',
        performedBy: booking.artist,
        performedByRole: 'artist',
        createdAt: booking.bookingDate || booking.updatedAt,
      })
    }

    if (booking.status === BOOKING_STATUS.COMPLETED) {
      initialHistories.push({
        booking: booking._id,
        bookingNumber: booking.bookingNumber,
        status: BOOKING_STATUS.COMPLETED,
        milestone: BOOKING_TIMELINE_MILESTONE.SERVICE_COMPLETED,
        title: 'Service Completed',
        description: 'Service delivery completed',
        performedBy: booking.artist,
        performedByRole: 'artist',
        createdAt: booking.completionDetails?.completedAt || booking.updatedAt,
      })

      if (booking.completionDetails?.signedAt) {
        initialHistories.push({
          booking: booking._id,
          bookingNumber: booking.bookingNumber,
          status: BOOKING_STATUS.COMPLETED,
          milestone: BOOKING_TIMELINE_MILESTONE.BOOKING_CLOSED,
          title: 'Booking Closed',
          description: 'Customer signed off and booking closed',
          performedBy: booking.customer,
          performedByRole: 'customer',
          createdAt: booking.completionDetails.signedAt,
        })
      }
    }

    if (booking.status === BOOKING_STATUS.CANCELLED || booking.status === BOOKING_STATUS.DECLINED) {
      initialHistories.push({
        booking: booking._id,
        bookingNumber: booking.bookingNumber,
        status: booking.status,
        milestone:
          booking.status === BOOKING_STATUS.DECLINED
            ? BOOKING_TIMELINE_MILESTONE.DECLINED
            : BOOKING_TIMELINE_MILESTONE.CANCELLED,
        title: booking.status === BOOKING_STATUS.DECLINED ? 'Booking Declined' : 'Booking Cancelled',
        description: booking.cancellationReason || `Cancelled by ${booking.cancelledByRole || 'user'}`,
        performedBy: booking.cancelledBy || null,
        performedByRole: booking.cancelledByRole || 'system',
        createdAt: booking.cancelledAt || booking.updatedAt,
      })
    }

    try {
      historyItems = (await BookingHistory.insertMany(initialHistories)) as any[]
    } catch {
      historyItems = initialHistories as any[]
    }
  }

  return historyItems
}


/**
 * Get all bookings with stats for Admin (Figma Admin/5.png)
 */
const getAllBookingsAdmin = async (query: {
  page?: string | number
  limit?: string | number
  search?: string
  status?: string
  category?: string
  visitType?: string
  paymentStatus?: string
  startDate?: string
  endDate?: string
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}) => {
  const page = Math.max(1, Number(query.page || 1))
  const limit = Math.max(1, Math.min(100, Number(query.limit || 10)))
  const skip = (page - 1) * limit

  const filter: any = {}

  // Search by bookingNumber or customer/artist name/email
  if (query.search?.trim()) {
    const searchRegex = new RegExp(query.search.trim(), 'i')
    const matchingUsers = await User.find(
      { $or: [{ name: searchRegex }, { email: searchRegex }] },
      '_id'
    ).lean()
    const userIds = matchingUsers.map((u) => u._id)

    filter.$or = [
      { bookingNumber: searchRegex },
      { customer: { $in: userIds } },
      { artist: { $in: userIds } },
    ]
  }

  // Status Filter
  if (query.status && query.status.toLowerCase() !== 'all') {
    const st = query.status.toLowerCase()
    switch (st) {
      case 'accepted':
        filter.status = BOOKING_STATUS.ACCEPTED
        break
      case 'pending':
        filter.status = { $in: [BOOKING_STATUS.REQUESTED, BOOKING_STATUS.ACCEPTED] }
        break
      case 'confirmed':
        filter.status = { $in: [BOOKING_STATUS.CONFIRMED, BOOKING_STATUS.RESCHEDULED] }
        break
      case 'in_progress':
      case 'in progress':
        filter.status = BOOKING_STATUS.IN_PROGRESS
        break
      case 'completed':
        filter.status = BOOKING_STATUS.COMPLETED
        break
      case 'cancelled':
      case 'canceled':
        filter.status = { $in: [BOOKING_STATUS.CANCELLED, BOOKING_STATUS.DECLINED] }
        break
      case 'disputed':
        filter.status = { $in: [BOOKING_STATUS.NO_SHOW, BOOKING_STATUS.NO_SHOW_PENDING] }
        break
      default:
        filter.status = query.status
        break
    }
  }

  // Category Filter
  if (query.category) {
    const matchingServices = await ArtistServices.find(
      { category: query.category },
      '_id'
    ).lean()
    filter.service = { $in: matchingServices.map((s) => s._id) }
  }

  // Visit Type Filter
  if (query.visitType) {
    filter.visitType = query.visitType
  }

  // Payment Status Filter
  if (query.paymentStatus) {
    const ps = query.paymentStatus.toLowerCase()
    if (ps === 'paid') {
      filter['balancePayment.status'] = PAYMENT_STAGE_STATUS.CAPTURED
    } else if (ps === 'pending') {
      filter['balancePayment.status'] = { $ne: PAYMENT_STAGE_STATUS.CAPTURED }
      filter.status = { $nin: [BOOKING_STATUS.CANCELLED, BOOKING_STATUS.DECLINED] }
    } else if (ps === 'refunded') {
      filter.$or = [
        { status: BOOKING_STATUS.CANCELLED },
        { 'balancePayment.status': PAYMENT_STAGE_STATUS.REFUNDED },
        { 'initialPayment.status': PAYMENT_STAGE_STATUS.REFUNDED },
      ]
    }
  }

  // Date Range Filter
  if (query.startDate || query.endDate) {
    filter.bookingDate = {}
    if (query.startDate) {
      filter.bookingDate.$gte = moment(query.startDate).startOf('day').toDate()
    }
    if (query.endDate) {
      filter.bookingDate.$lte = moment(query.endDate).endOf('day').toDate()
    }
  }

  // Sorting
  const sortField = query.sortBy || 'createdAt'
  const sortDirection = query.sortOrder === 'asc' ? 1 : -1
  const sortOrder: any = { [sortField]: sortDirection }

  // Query Data and Stats in parallel
  const todayStart = moment().startOf('day').toDate()
  const todayEnd = moment().endOf('day').toDate()

  const [bookings, total, totalAllTime, todayCount, pendingCount, completedCount, cancelledCount] =
    await Promise.all([
      Booking.find(filter)
        .sort(sortOrder)
        .skip(skip)
        .limit(limit)
        .populate('customer', 'name email phone profileImage')
        .populate('artist', 'name email phone profileImage')
        .populate({
          path: 'service',
          select: 'name durationMinutes price category',
          populate: { path: 'category', select: 'name icon' },
        })
        .populate({
          path: 'services',
          select: 'name durationMinutes price category',
          populate: { path: 'category', select: 'name icon' },
        })
        .populate('address')
        .lean(),
      Booking.countDocuments(filter),
      Booking.countDocuments(),
      Booking.countDocuments({ bookingDate: { $gte: todayStart, $lte: todayEnd } }),
      Booking.countDocuments({
        status: { $in: [BOOKING_STATUS.REQUESTED, BOOKING_STATUS.ACCEPTED] },
      }),
      Booking.countDocuments({ status: BOOKING_STATUS.COMPLETED }),
      Booking.countDocuments({
        status: { $in: [BOOKING_STATUS.CANCELLED, BOOKING_STATUS.DECLINED] },
      }),
    ])

  const formattedBookings = bookings.map((b: any) => {
    let paymentStatus = 'Pending'
    if (b.status === BOOKING_STATUS.CANCELLED || b.status === BOOKING_STATUS.DECLINED) {
      paymentStatus = b.depositForfeited ? 'Partial Refund' : 'Refunded'
    } else if (b.balancePayment?.status === PAYMENT_STAGE_STATUS.CAPTURED) {
      paymentStatus = 'Paid'
    } else if (b.initialPayment?.status === PAYMENT_STAGE_STATUS.CAPTURED) {
      paymentStatus = 'Partial (20% Paid)'
    }

    return {
      _id: b._id,
      bookingNumber: b.bookingNumber,
      bookingGroupId: b.bookingGroupId,
      customer: b.customer,
      artist: b.artist,
      service: b.service,
      services: b.services,
      category:
        b.service?.category?.name ||
        (Array.isArray(b.services) && b.services[0]?.category?.name) ||
        'General',
      bookingDate: b.bookingDate,
      startTime: b.startTime,
      endTime: b.endTime,
      durationMinutes: b.durationMinutes,
      visitType: b.visitType,
      status: b.status,
      paymentStatus,
      amount: b.totalBookingPrice,
      grossAmount: b.grossAmount,
      travelFee: b.travelFee,
      parkingFee: b.parkingFee,
      gstAmount: b.gstAmount,
      initialPayment: b.initialPayment,
      balancePayment: b.balancePayment,
      createdAt: b.createdAt,
    }
  })

  return {
    bookings: formattedBookings,
    stats: {
      totalBookings: totalAllTime,
      todayBookings: todayCount,
      pending: pendingCount,
      completed: completedCount,
      cancelled: cancelledCount,
    },
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  }
}

/**
 * Get recent bookings for Admin Dashboard (Figma Admin/1.png)
 */
const getRecentBookingsAdmin = async (queryLimit = 6) => {
  const limit = Math.max(1, Math.min(50, Number(queryLimit || 6)))

  const bookings = await Booking.find()
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('customer', 'name email profileImage')
    .populate('artist', 'name email profileImage')
    .populate({
      path: 'service',
      select: 'name durationMinutes price category',
      populate: { path: 'category', select: 'name' },
    })
    .populate({
      path: 'services',
      select: 'name durationMinutes price category',
      populate: { path: 'category', select: 'name' },
    })
    .lean()

  const formattedRecent = bookings.map((b: any) => {
    let paymentStatus = 'Pending'
    if (b.status === BOOKING_STATUS.CANCELLED || b.status === BOOKING_STATUS.DECLINED) {
      paymentStatus = 'Refunded'
    } else if (b.balancePayment?.status === PAYMENT_STAGE_STATUS.CAPTURED) {
      paymentStatus = 'Paid'
    }

    return {
      id: b.bookingNumber,
      bookingId: b._id,
      customer: {
        _id: b.customer?._id,
        name: b.customer?.name || 'Customer',
        email: b.customer?.email,
        profileImage: b.customer?.profileImage,
      },
      artist: {
        _id: b.artist?._id,
        name: b.artist?.name || 'Artist',
        email: b.artist?.email,
        profileImage: b.artist?.profileImage,
      },
      service: {
        _id: b.service?._id,
        name:
          Array.isArray(b.services) && b.services.length > 0
            ? b.services.map((s: any) => s.name).join(', ')
            : b.service?.name || 'Beauty Service',
        category: b.service?.category?.name || b.services?.[0]?.category?.name,
      },
      services: b.services,
      amount: b.totalBookingPrice,
      status: b.status,
      paymentStatus,
      bookingDate: b.bookingDate,
      startTime: b.startTime,
      date: b.bookingDate
        ? moment(b.bookingDate).format('MMM D, YYYY')
        : moment(b.createdAt).format('MMM D, YYYY'),
      createdAt: b.createdAt,
    }
  })

  return formattedRecent
}

/**
 * Get booking timeline and history log for Admin (Figma Admin/6.png)
 */
const getBookingTimelineAdmin = async (bookingId: string) => {
  const query = mongoose.Types.ObjectId.isValid(bookingId)
    ? { _id: bookingId }
    : { bookingNumber: bookingId }

  const booking = await Booking.findOne(query).lean()
  if (!booking) {
    throw new AppError(httpStatus.NOT_FOUND, 'Booking not found')
  }

  const timeline = await getBookingTimelineFromHistory(booking)
  return {
    bookingId: booking._id,
    bookingNumber: booking.bookingNumber,
    currentStatus: booking.status,
    timeline,
  }
}

/**
 * Get comprehensive booking details for Admin (Figma Admin/6.png)
 */
const getBookingDetailsAdmin = async (bookingId: string) => {
  const query = mongoose.Types.ObjectId.isValid(bookingId)
    ? { _id: bookingId }
    : { bookingNumber: bookingId }

  const booking = await Booking.findOne(query)
    .populate('customer', 'name email phone profileImage role status')
    .populate('artist', 'name email phone profileImage role status')
    .populate({
      path: 'service',
      select: 'name durationMinutes price description category',
      populate: { path: 'category', select: 'name icon' },
    })
    .populate({
      path: 'services',
      select: 'name durationMinutes price description category',
      populate: { path: 'category', select: 'name icon' },
    })
    .populate('address')
    .populate('promoCode')
    .lean()

  if (!booking) {
    throw new AppError(httpStatus.NOT_FOUND, 'Booking not found')
  }

  const [artistProfile, reviews] = await Promise.all([
    ArtistProfile.findOne({ user: (booking.artist as any)?._id }).lean(),
    Review.find({ artist: (booking.artist as any)?._id }).select('rating').lean(),
  ])

  const totalReviews = reviews.length
  const avgRating = totalReviews
    ? Number((reviews.reduce((acc, r) => acc + (r.rating || 0), 0) / totalReviews).toFixed(1))
    : 0

  const location =
    booking.serviceLocationSnapshot?.address ||
    (booking.address as any)?.address ||
    (booking.address as any)?.formattedAddress ||
    'Client location'

  const timeline = await getBookingTimelineFromHistory(booking)

  return {
    booking: {
      _id: booking._id,
      bookingNumber: booking.bookingNumber,
      status: booking.status,
      visitType: booking.visitType,
      bookingDate: booking.bookingDate,
      startTime: booking.startTime,
      endTime: booking.endTime,
      durationMinutes: booking.durationMinutes,
      guestCount: booking.guestCount,
      createdAt: booking.createdAt,
      updatedAt: booking.updatedAt,
    },
    bookingInformation: {
      bookingId: booking.bookingNumber,
      createdDate: booking.createdAt,
      visitType: booking.visitType === 'home_visit' ? 'Home Visit' : 'Salon Visit',
      transactionId:
        booking.balancePayment?.stripePaymentIntentId ||
        booking.initialPayment?.stripePaymentIntentId ||
        '—',
      location,
      travelFee: booking.travelFee || 0,
      parkingFee: booking.parkingFee || 0,
    },
    customerInformation: {
      _id: (booking.customer as any)?._id,
      name: (booking.customer as any)?.name || 'Customer',
      email: (booking.customer as any)?.email,
      phone: (booking.customer as any)?.phone || '—',
      profileImage: (booking.customer as any)?.profileImage,
      location,
      badge:
        (booking.customer as any)?.role === 'customer'
          ? 'Customer'
          : (booking.customer as any)?.role || 'Member',
    },
    artistInformation: {
      _id: (booking.artist as any)?._id,
      name: (booking.artist as any)?.name || 'Artist',
      email: (booking.artist as any)?.email,
      phone: (booking.artist as any)?.phone || '—',
      profileImage: (booking.artist as any)?.profileImage,
      businessName:
        artistProfile?.businessName ||
        (booking.service as any)?.category?.name ||
        'Beauty Specialist',
      abn: artistProfile?.abn,
      isGstRegistered: artistProfile?.isGstRegistered || false,
      rating: avgRating,
      reviewsCount: totalReviews,
    },
    serviceDetails: {
      _id: (booking.service as any)?._id,
      name:
        Array.isArray((booking as any).services) && (booking as any).services.length > 0
          ? (booking as any).services.map((s: any) => s.name).join(', ')
          : (booking.service as any)?.name,
      category:
        (booking.service as any)?.category?.name ||
        ((booking as any).services?.[0] as any)?.category?.name,
      durationMinutes: booking.durationMinutes,
      price: booking.servicePrice,
      totalAmount: booking.totalBookingPrice,
      specialNotes: booking.completionDetails?.specialNotes || booking.clientNotes || '',
      services: (booking as any).services || [],
    },
    paymentDetails: {
      transactionId:
        booking.balancePayment?.stripePaymentIntentId ||
        booking.initialPayment?.stripePaymentIntentId ||
        '—',
      paymentMethod: booking.stripePaymentMethodId ? 'Stripe Card (Vaulted)' : 'Stripe',
      grossAmount: booking.grossAmount,
      servicePrice: booking.servicePrice,
      discountAmount: booking.discountAmount,
      platformCreditApplied: booking.platformCreditApplied,
      gstAmount: booking.gstAmount,
      totalBookingPrice: booking.totalBookingPrice,
      platformCommissionPercentage: booking.platformCommissionPercentage || 20,
      platformCommissionAmount: booking.platformCommissionAmount,
      platformCommissionGst: booking.platformCommissionGst,
      artistPayout: booking.artistNetPayout,
      initialPayment: booking.initialPayment,
      balancePayment: booking.balancePayment,
    },
    invoices: {
      customerInvoiceId: booking.stripeInvoiceId,
      customerInvoiceUrl: booking.stripeInvoiceUrl,
      customerInvoicePdf: booking.stripeInvoicePdf,
      artistInvoiceId: booking.artistStripeInvoiceId,
      artistInvoiceUrl: booking.artistStripeInvoiceUrl,
      artistInvoicePdf: booking.artistStripeInvoicePdf,
    },
    completionDetails: booking.completionDetails,
    rescheduleRequest: booking.rescheduleRequest,
    noShowDetails: booking.noShowDetails,
    internalNotes: booking.adminNotes || '',
    timeline,
  }
}

/**
 * Update internal admin notes on a booking (Figma Admin/6.png)
 */
const updateAdminBookingNotes = async (bookingId: string, adminNotes: string) => {
  const query = mongoose.Types.ObjectId.isValid(bookingId)
    ? { _id: bookingId }
    : { bookingNumber: bookingId }

  const booking = await Booking.findOneAndUpdate(
    query,
    { $set: { adminNotes } },
    { new: true }
  )

  if (!booking) {
    throw new AppError(httpStatus.NOT_FOUND, 'Booking not found')
  }

  return {
    message: 'Internal admin notes updated successfully!',
    adminNotes: booking.adminNotes,
  }
}

export const bookingServices = {
  checkoutPreview,
  createBooking,
  cancelBooking,
  customerCancelBooking,
  artistCancelBooking,
  getMyBookings,
  getBookingById,
  getBookingInvoice,
  getBookingReceipt,
  getArtistInvoice,
  issueCustomerStripeInvoice,
  issueArtistRctiStripeInvoice,
  payBalance,
  acceptBooking,
  confirmBookingPayment,
  declineBooking,
  completeBooking,
  customerSign,
  requestReschedule,
  respondReschedule,
  getArtistInboxSummary,
  reportCustomerNoShow,
  verifyCustomerNoShow,
  voidOrCreditNoteInvoice,
  getAllBookingsAdmin,
  getRecentBookingsAdmin,
  getBookingTimelineAdmin,
  getBookingDetailsAdmin,
  updateAdminBookingNotes,
  recordBookingHistory,
  getBookingTimelineFromHistory,
}
