import {
  PaymentTransaction,
  PAYMENT_STATUS,
  PAYMENT_TRANSACTION_TYPE,
  type TPaymentStatus,
  type TPaymentTransactionType,
} from '@repo/db'
import moment from 'moment'
import { Types } from 'mongoose'

export interface ITransactionQuery {
  page?: string | number
  limit?: string | number
  status?: TPaymentStatus
  type?: TPaymentTransactionType
  startDate?: string
  endDate?: string
  searchTerm?: string
}

/**
 * Get payment transactions for Customer (charges, 20% deposit, 80% balance, refunds)
 */
const getCustomerTransactions = async (
  userId: string | Types.ObjectId,
  query: ITransactionQuery
) => {
  const page = Math.max(1, Number(query.page || 1))
  const limit = Math.max(1, Math.min(100, Number(query.limit || 10)))
  const skip = (page - 1) * limit

  const filter: Record<string, unknown> = {
    user: new Types.ObjectId(String(userId)),
  }

  if (query.status) {
    filter.status = query.status
  }

  if (query.type) {
    filter.type = query.type
  }

  if (query.startDate || query.endDate) {
    const dateFilter: Record<string, unknown> = {}
    if (query.startDate) {
      dateFilter.$gte = moment(query.startDate).startOf('day').toDate()
    }
    if (query.endDate) {
      dateFilter.$lte = moment(query.endDate).endOf('day').toDate()
    }
    filter.createdAt = dateFilter
  }

  if (query.searchTerm && query.searchTerm.trim()) {
    const term = query.searchTerm.trim()
    filter.$or = [
      { transactionId: { $regex: term, $options: 'i' } },
      { stripePaymentIntentId: { $regex: term, $options: 'i' } },
      { bookingGroupId: { $regex: term, $options: 'i' } },
    ]
  }

  const [transactions, total, summaryAgg] = await Promise.all([
    PaymentTransaction.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('artist', 'name email phone profileImage profilePicture')
      .populate({
        path: 'booking',
        select:
          'bookingNumber bookingDate startTime endTime visitType status service services totalBookingPrice servicePrice travelFee parkingFee address',
        populate: {
          path: 'services',
          select: 'name durationMinutes price',
        },
      })
      .lean(),
    PaymentTransaction.countDocuments(filter),
    PaymentTransaction.aggregate([
      { $match: { user: new Types.ObjectId(String(userId)) } },
      {
        $group: {
          _id: null,
          totalPaid: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$status', PAYMENT_STATUS.SUCCEEDED] },
                    { $ne: ['$type', PAYMENT_TRANSACTION_TYPE.REFUND] },
                  ],
                },
                '$amount',
                0,
              ],
            },
          },
          totalRefunded: {
            $sum: {
              $cond: [
                {
                  $or: [
                    { $eq: ['$type', PAYMENT_TRANSACTION_TYPE.REFUND] },
                    { $eq: ['$status', PAYMENT_STATUS.REFUNDED] },
                  ],
                },
                '$amount',
                0,
              ],
            },
          },
        },
      },
    ]),
  ])

  const summary = {
    totalPaid: Math.round(((summaryAgg[0]?.totalPaid || 0) + Number.EPSILON) * 100) / 100,
    totalRefunded: Math.round(((summaryAgg[0]?.totalRefunded || 0) + Number.EPSILON) * 100) / 100,
    currency: 'AUD',
  }

  return {
    transactions,
    summary,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  }
}

/**
 * Get earnings & payout transactions for Artist (Stripe transfers, net share, platform deductions)
 */
const getArtistTransactions = async (
  artistId: string | Types.ObjectId,
  query: ITransactionQuery
) => {
  const page = Math.max(1, Number(query.page || 1))
  const limit = Math.max(1, Math.min(100, Number(query.limit || 10)))
  const skip = (page - 1) * limit

  const filter: Record<string, unknown> = {
    artist: new Types.ObjectId(String(artistId)),
  }

  if (query.status) {
    filter.status = query.status
  }

  if (query.type) {
    filter.type = query.type
  }

  if (query.startDate || query.endDate) {
    const dateFilter: Record<string, unknown> = {}
    if (query.startDate) {
      dateFilter.$gte = moment(query.startDate).startOf('day').toDate()
    }
    if (query.endDate) {
      dateFilter.$lte = moment(query.endDate).endOf('day').toDate()
    }
    filter.createdAt = dateFilter
  }

  if (query.searchTerm && query.searchTerm.trim()) {
    const term = query.searchTerm.trim()
    filter.$or = [
      { transactionId: { $regex: term, $options: 'i' } },
      { stripeTransferId: { $regex: term, $options: 'i' } },
      { bookingGroupId: { $regex: term, $options: 'i' } },
    ]
  }

  const [transactions, total, summaryAgg] = await Promise.all([
    PaymentTransaction.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('user', 'name email phone profileImage profilePicture')
      .populate({
        path: 'booking',
        select:
          'bookingNumber bookingDate startTime endTime visitType status service services totalBookingPrice servicePrice travelFee parkingFee address artistNetPayout',
        populate: {
          path: 'services',
          select: 'name durationMinutes price',
        },
      })
      .lean(),
    PaymentTransaction.countDocuments(filter),
    PaymentTransaction.aggregate([
      { $match: { artist: new Types.ObjectId(String(artistId)) } },
      {
        $group: {
          _id: null,
          totalEarnings: {
            $sum: {
              $cond: [
                { $eq: ['$status', PAYMENT_STATUS.SUCCEEDED] },
                '$artistNetShare',
                0,
              ],
            },
          },
          pendingPayout: {
            $sum: {
              $cond: [
                { $eq: ['$status', PAYMENT_STATUS.PENDING] },
                '$artistNetShare',
                0,
              ],
            },
          },
          totalTransferred: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$type', PAYMENT_TRANSACTION_TYPE.STRIPE_TRANSFER] },
                    { $eq: ['$status', PAYMENT_STATUS.SUCCEEDED] },
                  ],
                },
                '$amount',
                0,
              ],
            },
          },
        },
      },
    ]),
  ])

  const summary = {
    totalEarnings: Math.round(((summaryAgg[0]?.totalEarnings || 0) + Number.EPSILON) * 100) / 100,
    pendingPayout: Math.round(((summaryAgg[0]?.pendingPayout || 0) + Number.EPSILON) * 100) / 100,
    totalTransferred:
      Math.round(((summaryAgg[0]?.totalTransferred || 0) + Number.EPSILON) * 100) / 100,
    currency: 'AUD',
  }

  return {
    transactions,
    summary,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  }
}

export const paymentTransactionServices = {
  getCustomerTransactions,
  getArtistTransactions,
}

