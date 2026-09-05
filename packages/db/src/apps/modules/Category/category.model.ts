import { Schema, model } from 'mongoose'
import type { ICategoryDoc } from './category.interfaces'

const categorySchema = new Schema<ICategoryDoc>(
  {
    name: {
      type: String,
      required: true,
    },
    slug: {
      type: String,
      required: true,
      index: true,
      unique: true,
    },
    description: {
      type: String,
    },
    isActive: {
      type: Boolean,
    },
    createdBy: {
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
// categorySchema.statics.getById = async function (id: string) {
//   return this.findById(id)
// }

export const Category = model<ICategoryDoc>('Category', categorySchema)
