import {
  Wallet,
  WalletLedger,
  WALLET_SOURCE,
  WALLET_TRANSACTION_TYPE,
  type TWalletSource,
  type TWalletUserRole,
} from '@repo/db'
import { AppError } from '@repo/shared'
import httpStatus from 'http-status'
import moment from 'moment'
import { Types } from 'mongoose'

interface ICreditWalletParams {
  userId: string | Types.ObjectId
  userRole?: TWalletUserRole | undefined
  amount: number
  source: TWalletSource
  bookingId?: string | Types.ObjectId | null | undefined
  bookingGroupId?: string | null | undefined
  description?: string | undefined
  expiresInMonths?: number | undefined
}

interface IDebitWalletParams {
  userId: string | Types.ObjectId
  amount: number
  source: TWalletSource
  bookingId?: string | Types.ObjectId | null | undefined
  bookingGroupId?: string | null | undefined
  description?: string | undefined
}

/**
 * Get or automatically create user wallet
 */
const getOrCreateUserWallet = async (
  userId: string | Types.ObjectId,
  userRole: TWalletUserRole = 'customer'
) => {
  let wallet = await Wallet.findOne({ user: userId })
  if (!wallet) {
    wallet = await Wallet.create({
      user: userId,
      userRole,
      balance: 0,
      pendingBalance: 0,
      currency: 'AUD',
      isActive: true,
    })
  }
  return wallet
}

/**
 * Credit funds to user wallet and record ledger entry
 */
const creditUserWallet = async (params: ICreditWalletParams) => {
  const {
    userId,
    userRole = 'customer',
    amount,
    source,
    bookingId,
    bookingGroupId,
    description,
    expiresInMonths = 36, // Australian standard 3-year validity for store/platform credit
  } = params

  if (amount <= 0) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Credit amount must be greater than zero')
  }

  const wallet = await getOrCreateUserWallet(userId, userRole)
  const balanceBefore = wallet.balance
  const balanceAfter = Math.round((balanceBefore + amount + Number.EPSILON) * 100) / 100

  wallet.balance = balanceAfter
  await wallet.save()

  // Calculate expiry date if applicable (e.g. CANCELLATION_CREDIT or ARTIST_COMPENSATION)
  let expiresAt: Date | undefined
  if (
    source === WALLET_SOURCE.CANCELLATION_CREDIT ||
    source === WALLET_SOURCE.ARTIST_COMPENSATION
  ) {
    expiresAt = moment().add(expiresInMonths, 'months').toDate()
  }

  const ledgerPayload: any = {
    wallet: wallet._id,
    user: userId,
    type: WALLET_TRANSACTION_TYPE.CREDIT,
    source,
    amount,
    balanceBefore,
    balanceAfter,
    isExpired: false,
    description: description || `Wallet credited via ${source}`,
  }
  if (bookingId) ledgerPayload.booking = bookingId
  if (bookingGroupId) ledgerPayload.bookingGroupId = bookingGroupId
  if (expiresAt) ledgerPayload.expiresAt = expiresAt

  const ledgerEntry = await WalletLedger.create(ledgerPayload)

  return { wallet, ledgerEntry }
}

/**
 * Debit funds from user wallet (e.g. when platform credit applied to booking)
 */
const debitUserWallet = async (params: IDebitWalletParams) => {
  const { userId, amount, source, bookingId, bookingGroupId, description } = params

  if (amount <= 0) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Debit amount must be greater than zero')
  }

  const wallet = await Wallet.findOne({ user: userId })
  if (!wallet || wallet.balance < amount) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `Insufficient platform wallet credit. Available: $${wallet?.balance || 0} AUD, requested: $${amount} AUD`
    )
  }

  const balanceBefore = wallet.balance
  const balanceAfter = Math.round((balanceBefore - amount + Number.EPSILON) * 100) / 100

  wallet.balance = balanceAfter
  await wallet.save()

  const ledgerPayload: any = {
    wallet: wallet._id,
    user: userId,
    type: WALLET_TRANSACTION_TYPE.DEBIT,
    source,
    amount,
    balanceBefore,
    balanceAfter,
    description: description || `Wallet debited via ${source}`,
  }
  if (bookingId) ledgerPayload.booking = bookingId
  if (bookingGroupId) ledgerPayload.bookingGroupId = bookingGroupId

  const ledgerEntry = await WalletLedger.create(ledgerPayload)

  return { wallet, ledgerEntry }
}

/**
 * Rollback a debit if payment/booking failed
 */
const rollbackDebit = async (
  userId: string | Types.ObjectId,
  amount: number,
  bookingId?: string | Types.ObjectId,
  reason = 'Booking payment failed - instant credit reversal'
) => {
  if (amount <= 0) return null

  const creditParams: ICreditWalletParams = {
    userId,
    amount,
    source: WALLET_SOURCE.BOOKING_ROLLBACK,
    description: reason,
  }
  if (bookingId) creditParams.bookingId = bookingId

  return creditUserWallet(creditParams)
}

/**
 * Get client or artist wallet balance
 */
const getMyWallet = async (userId: string | Types.ObjectId) => {
  const wallet = await getOrCreateUserWallet(userId)
  return wallet
}

/**
 * Get user wallet transactions history with pagination
 */
const getMyWalletLedger = async (
  userId: string | Types.ObjectId,
  query: { page?: number; limit?: number }
) => {
  const page = Number(query.page || 1)
  const limit = Number(query.limit || 10)
  const skip = (page - 1) * limit

  const [transactions, total] = await Promise.all([
    WalletLedger.find({ user: userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('booking', 'bookingNumber bookingDate status')
      .lean(),
    WalletLedger.countDocuments({ user: userId }),
  ])

  return {
    transactions,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  }
}

export const walletServices = {
  getOrCreateUserWallet,
  creditUserWallet,
  debitUserWallet,
  rollbackDebit,
  getMyWallet,
  getMyWalletLedger,
}
