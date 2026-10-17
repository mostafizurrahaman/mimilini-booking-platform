import { Schema, model } from 'mongoose'
import type { IProcessedStripeEventDoc } from './processed-stripe-event.interfaces'

const processedStripeEventSchema = new Schema<IProcessedStripeEventDoc>(
  {
    eventId: {
      type: String,
      unique: true,
      index: true,
    },
    createdAt: {
      type: Date,
      required: true,
      expires: '30d',
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
)

// Static method
// processedStripeEventSchema.statics.getById = async function (id: string) {
//   return this.findById(id)
// }

export const ProcessedStripeEvent = model<IProcessedStripeEventDoc>(
  'ProcessedStripeEvent',
  processedStripeEventSchema
)
