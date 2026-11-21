import { Schema, model, type Document, type Types } from 'mongoose'

export interface IPromoCodeUsage {
  promoCode: Types.ObjectId
  user: Types.ObjectId
  booking?: Types.ObjectId | null
  discountAmount?: number
}

export interface IPromoCodeUsageDoc extends Document, IPromoCodeUsage {
  createdAt: Date
  updatedAt: Date
}

const promoCodeUsageSchema = new Schema<IPromoCodeUsageDoc>(
  {
    promoCode: {
      type: Schema.Types.ObjectId,
      ref: 'PromoCode',
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
      default: null,
      index: true,
    },
    discountAmount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
)

// Ensure compound index for fast lookups and unique usage check per user per promo code
promoCodeUsageSchema.index({ user: 1, promoCode: 1 }, { unique: true })

export const PromoCodeUsage = model<IPromoCodeUsageDoc>(
  'PromoCodeUsage',
  promoCodeUsageSchema
)
