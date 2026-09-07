import { Schema, model } from 'mongoose'
import type { IBeautyInspirationDoc } from './beauty-inspiration.interfaces'

const beautyInspirationSchema = new Schema<IBeautyInspirationDoc>(
  {
    url: {
      type: String,
      required: true,
    },
    tags: {
      type: [String],
      required: true,
      min: 1,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
)

// Static method
// beautyInspirationSchema.statics.getById = async function (id: string) {
//   return this.findById(id)
// }

export const BeautyInspiration = model<IBeautyInspirationDoc>(
  'BeautyInspiration',
  beautyInspirationSchema
)
