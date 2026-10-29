import { Document, Types } from 'mongoose'
import type { TPaymentMethodType } from './payment-method.constants'

export interface IPaymentMethod {
  user: Types.ObjectId // customer
  stripePaymentMethodId: string
  type: TPaymentMethodType
  cardBrand: string
  last4: string
  expMonth: number
  expYear: number
  isDefault: boolean
}

export interface IPaymentMethodDoc extends Document, IPaymentMethod {}

// export interface IPaymentMethodModel extends Model<IPaymentMethodDoc> {
//   getById(id: string): Promise<IPaymentMethod | null>
// }
