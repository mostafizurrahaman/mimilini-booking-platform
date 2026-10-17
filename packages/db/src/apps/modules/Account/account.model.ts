import { Schema, Types, model } from 'mongoose'
import type { IAccountDoc } from './account.interfaces'
import {
  accountStatus,
  Countries,
  CountryValues,
  Currency,
  CurrencyValues,
} from './account.constants'

const accountSchema = new Schema<IAccountDoc>(
  {
    user: {
      type: Types.ObjectId,
      ref: 'User',
      required: true,
    },
    account: {
      type: String,
      required: true,
      unique: true,
    },
    country: {
      type: String,
      enum: CountryValues,
      default: Countries.AUSTRALIA,
    },
    currency: {
      type: String,
      enum: CurrencyValues,
      default: Currency.AUD,
    },
    chargesEnabled: {
      type: Boolean,
      required: true,
      default: false,
    },
    payoutsEnabled: {
      type: Boolean,
      required: true,
      default: false,
    },
    detailsSubmitted: {
      type: Boolean,
      required: true,
      default: false,
    },
    disabledReason: {
      type: String,
    },
    status: {
      type: String,
      required: true,
      default: accountStatus.PENDING,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
)

// Static method
// accountSchema.statics.getById = async function (id: string) {
//   return this.findById(id)
// }

export const Account = model<IAccountDoc>('Account', accountSchema)
