import { Schema, model } from 'mongoose'
import type { IAddressDoc } from './address.interfaces'
import { AddressTypeValues } from './address.constants'

const addressSchema = new Schema<IAddressDoc>(
  {
    customer: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    type: {
      type: String,
      enum: AddressTypeValues,
      required: true,
    },
    address: {
      type: String,
      required: true,
    },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number],
        required: true,
      },
    },
    apartmentOrUnit: {
      type: String,
    },
    city: {
      type: String,
      required: true,
    },
    state: {
      type: String,
      required: true,
    },
    postalCode: {
      type: String,
      required: true,
    },
    country: {
      type: String,
      required: true,
    },
    isDefault: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
)

// Static method
// addressSchema.statics.getById = async function (id: string) {
//   return this.findById(id)
// }

export const Address = model<IAddressDoc>('Address', addressSchema)
