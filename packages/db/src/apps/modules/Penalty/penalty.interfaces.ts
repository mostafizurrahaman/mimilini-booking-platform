import { Document, Model, Types } from 'mongoose'
import type {
  TPenaltyBudgetTier,
  TPenaltyStatus,
  TPenaltyTimeframeTier,
} from './penalty.constants'

export interface IPenalty {
  booking: Types.ObjectId
  bookingNumber: string
  customer: Types.ObjectId
  artist: Types.ObjectId
  bookingAmount: number
  budgetTier: TPenaltyBudgetTier
  timeframeTier: TPenaltyTimeframeTier
  penaltyAmount: number
  currency: string
  reason?: string | undefined
  isPenaltyRequired: boolean
  status: TPenaltyStatus
  deductedFromWallet: boolean
  stripeCheckoutSessionId?: string | null | undefined
  stripePaymentIntentId?: string | null | undefined
  stripeCheckoutUrl?: string | null | undefined
  paidAt?: Date | undefined
  waivedAt?: Date | undefined
  waivedBy?: Types.ObjectId | undefined
  createdAt?: Date
  updatedAt?: Date
}

export interface IPenaltyDoc extends Document, IPenalty {}

export interface IPenaltyModel extends Model<IPenaltyDoc> {}
