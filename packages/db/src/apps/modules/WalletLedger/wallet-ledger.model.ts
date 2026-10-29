import { Schema, model } from 'mongoose'
import type { IWalletLedgerDoc } from './wallet-ledger.interfaces'
import {
  WALLET_SOURCE_VALUES,
  WALLET_TRANSACTION_TYPE,
  WALLET_TRANSACTION_TYPE_VALUES,
} from './wallet-ledger.constants'

const walletLedgerSchema = new Schema<IWalletLedgerDoc>(
  {
    wallet: {
      type: Schema.Types.ObjectId,
      ref: 'Wallet',
      required: true,
      index: true,
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    booking: {
      type: Schema.Types.ObjectId,
      ref: 'Booking',
      index: true,
    },
    bookingGroupId: {
      type: String,
      trim: true,
    },
    type: {
      type: String,
      enum: WALLET_TRANSACTION_TYPE_VALUES,
      default: WALLET_TRANSACTION_TYPE.CREDIT,
      required: true,
    },
    source: {
      type: String,
      enum: WALLET_SOURCE_VALUES,
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    balanceBefore: {
      type: Number,
      required: true,
      min: 0,
    },
    balanceAfter: {
      type: Number,
      required: true,
      min: 0,
    },
    expiresAt: {
      type: Date,
      index: true,
    },
    isExpired: {
      type: Boolean,
      default: false,
      index: true,
    },
    description: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
)

walletLedgerSchema.index({ wallet: 1, createdAt: -1 })
walletLedgerSchema.index({ user: 1, createdAt: -1 })

export const WalletLedger = model<IWalletLedgerDoc>(
  'WalletLedger',
  walletLedgerSchema
)
