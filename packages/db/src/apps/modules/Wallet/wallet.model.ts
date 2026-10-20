import { Schema, model } from 'mongoose'
import type { IWalletDoc } from './wallet.interfaces'
import {
  WALLET_USER_ROLE,
  WALLET_USER_ROLE_VALUES,
} from './wallet.constants'

const walletSchema = new Schema<IWalletDoc>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    userRole: {
      type: String,
      enum: WALLET_USER_ROLE_VALUES,
      default: WALLET_USER_ROLE.CUSTOMER,
      required: true,
    },
    balance: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    pendingBalance: {
      type: Number,
      default: 0,
      min: 0,
    },
    currency: {
      type: String,
      default: 'AUD',
      uppercase: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
)

export const Wallet = model<IWalletDoc>('Wallet', walletSchema)
