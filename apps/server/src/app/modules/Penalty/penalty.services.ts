import {
  ArtistProfile,
  Penalty,
  PENALTY_STATUS,
  type IUser,
} from '@repo/db'
import { AppError } from '@repo/shared'
import httpStatus from 'http-status'
import Stripe from 'stripe'
import { stripe } from '@app/libs/stripe'
import configs from '@app/configs'

/**
 * Get penalties for the logged-in artist
 */
const getMyPenalties = async (user: IUser, query: { page?: number; limit?: number }) => {
  const page = Number(query.page || 1)
  const limit = Number(query.limit || 10)
  const skip = (page - 1) * limit

  const [penalties, total] = await Promise.all([
    Penalty.find({ artist: user._id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('booking', 'bookingNumber bookingDate status')
      .lean(),
    Penalty.countDocuments({ artist: user._id }),
  ])

  const pendingCount = await Penalty.countDocuments({
    artist: user._id,
    status: PENALTY_STATUS.PENDING,
  })

  return {
    penalties,
    hasPendingPenalties: pendingCount > 0,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  }
}

/**
 * Get all penalties (Admin)
 */
const getAllPenalties = async (query: {
  page?: number
  limit?: number
  status?: string
  artistId?: string
}) => {
  const page = Number(query.page || 1)
  const limit = Number(query.limit || 10)
  const skip = (page - 1) * limit

  const filter: any = {}
  if (query.status) filter.status = query.status
  if (query.artistId) filter.artist = query.artistId

  const [penalties, total] = await Promise.all([
    Penalty.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('artist', 'name email phone')
      .populate('customer', 'name email phone')
      .populate('booking', 'bookingNumber bookingDate')
      .lean(),
    Penalty.countDocuments(filter),
  ])

  return {
    penalties,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  }
}

/**
 * Artist creates a Stripe Checkout Session to pay a pending penalty directly
 */
const createPenaltyCheckoutSession = async (user: IUser, penaltyId: string) => {
  const penalty = await Penalty.findById(penaltyId)
  if (!penalty) {
    throw new AppError(httpStatus.NOT_FOUND, 'Penalty record not found')
  }

  if (penalty.artist.toString() !== user._id.toString()) {
    throw new AppError(httpStatus.FORBIDDEN, 'You are not authorized to pay this penalty')
  }

  if (penalty.status !== PENALTY_STATUS.PENDING) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `Penalty cannot be paid. Current status: ${penalty.status}`
    )
  }

  // Create Stripe Checkout Session
  const sessionPayload: Stripe.Checkout.SessionCreateParams = {
    mode: 'payment',
    line_items: [
      {
        price_data: {
          currency: 'aud',
          product_data: {
            name: `Cancellation Penalty Fee - Booking #${penalty.bookingNumber}`,
            description: `GST Inclusive (10% GST included) | Tier: ${penalty.budgetTier.toUpperCase()} | Timeframe: ${penalty.timeframeTier}`,
          },
          unit_amount: Math.round(penalty.penaltyAmount * 100),
        },
        quantity: 1,
      },
    ],
    metadata: {
      type: 'PENALTY_SETTLEMENT',
      penaltyId: penalty._id.toString(),
      artistId: user._id.toString(),
      bookingNumber: penalty.bookingNumber,
      bookingId: penalty.booking.toString(),
      isGstInclusive: 'true',
    },
    success_url: `${configs.stripe.successUrl}?type=penalty_success&penaltyId=${penalty._id}`,
    cancel_url: `${configs.stripe.cancelUrl}?type=penalty_cancel&penaltyId=${penalty._id}`,
  }

  if (user.stripeCustomerId) {
    sessionPayload.customer = user.stripeCustomerId
  } else if (user.email) {
    sessionPayload.customer_email = user.email
  }

  const session = await stripe.checkout.sessions.create(sessionPayload)

  penalty.stripeCheckoutSessionId = session.id
  penalty.stripeCheckoutUrl = session.url || undefined
  await penalty.save()

  return {
    checkoutUrl: session.url,
    sessionId: session.id,
    penalty,
  }
}

/**
 * Admin waives an artist penalty
 */
const waivePenalty = async (adminUser: IUser, penaltyId: string, reason?: string) => {
  const penalty = await Penalty.findById(penaltyId)
  if (!penalty) {
    throw new AppError(httpStatus.NOT_FOUND, 'Penalty record not found')
  }

  if (penalty.status === PENALTY_STATUS.PAID) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Penalty is already paid and cannot be waived')
  }

  penalty.status = PENALTY_STATUS.WAIVED
  penalty.waivedAt = new Date()
  penalty.waivedBy = adminUser._id
  if (reason) penalty.reason = `${penalty.reason || ''} [Waived: ${reason}]`.trim()
  await penalty.save()

  // Check if artist has any remaining PENDING penalties
  const remainingPending = await Penalty.countDocuments({
    artist: penalty.artist,
    status: PENALTY_STATUS.PENDING,
  })

  if (remainingPending === 0) {
    await ArtistProfile.findOneAndUpdate(
      { user: penalty.artist },
      { $set: { isPenaltyRequired: false } }
    )
  }

  return {
    message: 'Penalty waived successfully by administrator.',
    penalty,
    isPenaltyRequired: remainingPending > 0,
  }
}

export const penaltyServices = {
  getMyPenalties,
  getAllPenalties,
  createPenaltyCheckoutSession,
  waivePenalty,
}
