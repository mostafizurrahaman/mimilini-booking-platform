import { Document, Types } from 'mongoose'
import type {
  TWalletSource,
  TWalletTransactionType,
} from './wallet-ledger.constants'

export interface IWalletLedger {
  wallet: Types.ObjectId
  user: Types.ObjectId
  booking?: Types.ObjectId | null | undefined
  bookingGroupId?: string | null | undefined

  type: TWalletTransactionType // CREDIT (+), DEBIT (-)
  source: TWalletSource
  amount: number // Positive amount in AUD
  balanceBefore: number
  balanceAfter: number

  expiresAt?: Date | null | undefined // Set to 36 months for CANCELLATION_CREDIT under Australian law
  isExpired?: boolean | undefined
  description?: string | null | undefined
  createdAt?: Date | undefined
  updatedAt?: Date | undefined
}

export interface IWalletLedgerDoc extends Document, IWalletLedger {}
