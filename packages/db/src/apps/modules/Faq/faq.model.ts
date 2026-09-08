import { Schema, model } from 'mongoose'
import type { IFaqDoc } from './faq.interfaces'

const faqSchema = new Schema<IFaqDoc>(
  {
    question: {
      type: String,
    },
    slug: {
      type: String,
      unique: true,
      required: true,
    },
    answer: {
      type: String,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
)

// Static method
// faqSchema.statics.getById = async function (id: string) {
//   return this.findById(id)
// }

export const Faq = model<IFaqDoc>('Faq', faqSchema)
