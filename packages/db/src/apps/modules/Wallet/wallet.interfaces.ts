import { Document, Types } from 'mongoose'
import type { TWalletUserRole } from './wallet.constants'

export interface IWallet {
  user: Types.ObjectId
  userRole: TWalletUserRole
  balance: number // Current available usable balance (Platform credit or withdrawable artist balance)
  pendingBalance: number // Funds in escrow / reserved during payment
  currency: string // Default: 'AUD'
  isActive: boolean
  createdAt?: Date
  updatedAt?: Date
}

export interface IWalletDoc extends Document, IWallet {}
