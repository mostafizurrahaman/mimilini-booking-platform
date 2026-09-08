import { Schema, model } from 'mongoose'
import type { IContentDoc } from './content.interfaces'
import { contentTypeValues } from './content.constants'

const contentSchema = new Schema<IContentDoc>(
  {
    content: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: contentTypeValues,
      required: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
)

// Static method
// contentSchema.statics.getById = async function (id: string) {
//   return this.findById(id)
// }

export const Content = model<IContentDoc>('Content', contentSchema)
