import { Schema, model } from 'mongoose'
import type { IPaymentMethodDoc } from './payment-method.interfaces'
import { PaymentMethodType, paymentMethodValues } from './payment-method.constants'

const paymentMethodSchema = new Schema<IPaymentMethodDoc>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    stripePaymentMethodId: {
      type: String,
      required: true,
      unique: true,
    },
    type: {
      type: String,
      enum: paymentMethodValues,
      default: PaymentMethodType.CARD,
    },
    cardBrand: {
      type: String,
      required: true,
    },
    last4: {
      type: String,
      required: true,
    },
    expMonth: {
      type: Number,
      required: true,
    },
    expYear: {
      type: Number,
      required: true,
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
)

paymentMethodSchema.index(
  {
    user: 1,
  },
  {
    unique: true,
    partialFilterExpression: { isDefault: true },
  }
)

// Static method
// paymentMethodSchema.statics.getById = async function (id: string) {
//   return this.findById(id)
// }

export const PaymentMethod = model<IPaymentMethodDoc>('PaymentMethod', paymentMethodSchema)
