import { Schema, model } from 'mongoose'
import type { IPromoCodeDoc } from './promo-code.interfaces'
import { DISCOUNT_STATUS_VALUES, DISCOUNT_TYPE_VALUES } from './promo-code.constants'

const promoCodeSchema = new Schema<IPromoCodeDoc>(
  {
    promotionName: {
      type: String,
      required: true,
    },
    promoCode: {
      type: String,
      required: true,
    },
    minBookingValue: {
      type: Number,
      required: true,
      min: 0,
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
    },
    discountType: {
      type: String,
      enum: DISCOUNT_TYPE_VALUES,
      required: true,
    },
    discountValue: {
      type: Number,
      min: 1,
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
    },
    isAdminOffer: {
      type: Boolean,
      required: true,
    },
    author: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
)

// Static method
// promoCodeSchema.statics.getById = async function (id: string) {
//   return this.findById(id)
// }

promoCodeSchema.index({
  promoCode: 1,
  author: -1,
})

promoCodeSchema.index({
  promoCode: 1,
  isAdminOffer: -1,
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

export const PromoCode = model<IPromoCodeDoc>('PromoCode', promoCodeSchema)
