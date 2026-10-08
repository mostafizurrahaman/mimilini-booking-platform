import { Document, Types } from 'mongoose'
import type { TDiscountStatusType, TDiscountType } from './promo-code.constants'

export interface IPromoCode {
  promotionName: string
  promoCode: string
  minBookingValue: number
  usageLimit: number
  usageCount: number
  discountType: TDiscountType
  discountValue: number
  maxDiscountAmount?: number | undefined
  startDate: Date
  endDate: Date
  status: TDiscountStatusType
  isAdminOffer: boolean
  author: Types.ObjectId
}

export interface IPromoCodeDoc extends Document, IPromoCode {}

// export interface IPromoCodeModel extends Model<IPromoCodeDoc> {
//   getById(id: string): Promise<IPromoCode | null>
// }
