import { Document, Types } from 'mongoose'

export interface ICategory {
  name: string
  slug: string
  description: string
  isActive: boolean
  createdBy: Types.ObjectId
}

export interface ICategoryDoc extends Document, ICategory {}

// export interface ICategoryModel extends Model<ICategoryDoc> {
//   getById(id: string): Promise<ICategory | null>
// }
