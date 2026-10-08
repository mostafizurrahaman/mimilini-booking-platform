import { Schema, model } from 'mongoose'
import type { IPromoCodeDoc } from './promo-code.interfaces'
import {
  DISCOUNT_STATUS,
  DISCOUNT_STATUS_VALUES,
  DISCOUNT_TYPE_VALUES,
} from './promo-code.constants'

const promoCodeSchema = new Schema<IPromoCodeDoc>(
  {
    promotionName: {
      type: String,
      required: true,
      trim: true,
    },
    promoCode: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
    },
    minBookingValue: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    usageLimit: {
      type: Number,
      required: true,
      min: 1,
    },
    usageCount: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    discountType: {
      type: String,
      enum: DISCOUNT_TYPE_VALUES,
      required: true,
    },
    discountValue: {
      type: Number,
      required: true,
      min: 1,
    },
    maxDiscountAmount: {
      type: Number,
      min: 0,
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: DISCOUNT_STATUS_VALUES,
      default: DISCOUNT_STATUS.ACTIVE,
    },
    isAdminOffer: {
      type: Boolean,
      required: true,
      default: false,
    },
    author: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
)

promoCodeSchema.index({
  promoCode: 1,
  author: 1,
})

promoCodeSchema.index({
  promoCode: 1,
  isAdminOffer: 1,
})

promoCodeSchema.index({
  status: 1,
  createdAt: -1,
})

promoCodeSchema.index({
  status: 1,
  startDate: 1,
  endDate: 1,
})

promoCodeSchema.index({
  author: 1,
  createdAt: -1,
})

export const PromoCode = model<IPromoCodeDoc>('PromoCode', promoCodeSchema)
