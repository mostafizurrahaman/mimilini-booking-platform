import { Document } from 'mongoose'

export interface IFaq {
  question: string
  slug: string
  answer: string
}

export interface IFaqDoc extends Document, IFaq {}

// export interface IFaqModel extends Model<IFaqDoc> {
//   getById(id: string): Promise<IFaq | null>
// }
