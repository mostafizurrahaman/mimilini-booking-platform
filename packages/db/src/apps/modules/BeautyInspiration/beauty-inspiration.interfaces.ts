import { Document } from 'mongoose'

export interface IBeautyInspiration {
  url: string
  tags: string[]
}

export interface IBeautyInspirationDoc extends Document, IBeautyInspiration {}

// export interface IBeautyInspirationModel extends Model<IBeautyInspirationDoc> {
//   getById(id: string): Promise<IBeautyInspiration | null>
// }
