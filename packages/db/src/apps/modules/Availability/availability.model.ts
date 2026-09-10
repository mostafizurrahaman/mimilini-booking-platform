import { Schema, model } from 'mongoose'
  import type { IAvailabilityDoc } from './availability.interfaces'

const availabilitySchema = new Schema<IAvailabilityDoc>(
  {
    name: {
      type: String,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
)

// Static method
// availabilitySchema.statics.getById = async function (id: string) {
//   return this.findById(id)
// }

export const Availability = model<IAvailabilityDoc>(
  'Availability',
  availabilitySchema
)