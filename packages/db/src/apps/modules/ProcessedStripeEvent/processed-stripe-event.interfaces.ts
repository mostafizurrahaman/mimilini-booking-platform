import { Document } from 'mongoose'

export interface IProcessedStripeEvent {
  eventId: string
  createdAt: Date
}

export interface IProcessedStripeEventDoc extends Document, IProcessedStripeEvent {}

// export interface IProcessedStripeEventModel extends Model<IProcessedStripeEventDoc> {
//   getById(id: string): Promise<IProcessedStripeEvent | null>
// }
