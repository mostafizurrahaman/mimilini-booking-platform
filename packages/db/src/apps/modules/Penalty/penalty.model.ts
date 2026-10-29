import { Schema, model } from 'mongoose'
import type { IPenaltyDoc, IPenaltyModel } from './penalty.interfaces'
import {
  PENALTY_BUDGET_TIER_VALUES,
  PENALTY_STATUS,
  PENALTY_STATUS_VALUES,
  PENALTY_TIMEFRAME_TIER_VALUES,
} from './penalty.constants'

const penaltySchema = new Schema<IPenaltyDoc, IPenaltyModel>(
  {
    booking: {
      type: Schema.Types.ObjectId,
      ref: 'Booking',
      required: true,
      index: true,
    },
    bookingNumber: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    customer: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    artist: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    bookingAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    budgetTier: {
      type: String,
      enum: PENALTY_BUDGET_TIER_VALUES,
      required: true,
    },
    timeframeTier: {
      type: String,
      enum: PENALTY_TIMEFRAME_TIER_VALUES,
      required: true,
    },
    penaltyAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      default: 'AUD',
      uppercase: true,
    },
    reason: {
      type: String,
      trim: true,
    },
    isPenaltyRequired: {
      type: Boolean,
      default: true,
      index: true,
    },
    status: {
      type: String,
      enum: PENALTY_STATUS_VALUES,
      default: PENALTY_STATUS.PENDING,
      index: true,
    },
    deductedFromWallet: {
      type: Boolean,
      default: false,
    },
    stripeCheckoutSessionId: {
      type: String,
      trim: true,
      index: true,
    },
    stripePaymentIntentId: {
      type: String,
      trim: true,
      index: true,
    },
    stripeCheckoutUrl: {
      type: String,
      trim: true,
    },
    paidAt: {
      type: Date,
    },
    waivedAt: {
      type: Date,
    },
    waivedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
)

export const Penalty = model<IPenaltyDoc, IPenaltyModel>('Penalty', penaltySchema)
