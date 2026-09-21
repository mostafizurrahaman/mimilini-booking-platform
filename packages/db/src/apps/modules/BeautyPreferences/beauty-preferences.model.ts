import { Schema, model } from 'mongoose'
import type { IBeautyPreferencesDoc } from './beauty-preferences.interfaces'

const beautyPreferencesSchema = new Schema<IBeautyPreferencesDoc>(
  {
    category: {
      type: Schema.Types.ObjectId,
      ref: 'Category',
      required: true,
    },
    customer: {
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

// Static method
// beautyPreferencesSchema.statics.getById = async function (id: string) {
//   return this.findById(id)
// }

export const BeautyPreferences = model<IBeautyPreferencesDoc>(
  'BeautyPreferences',
  beautyPreferencesSchema
)
