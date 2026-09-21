import { Document, Types } from 'mongoose'

export interface IBeautyPreferences {
  category: Types.ObjectId
  customer: Types.ObjectId
}

export interface IBeautyPreferencesDoc extends Document, IBeautyPreferences {}

// export interface IBeautyPreferencesModel extends Model<IBeautyPreferencesDoc> {
//   getById(id: string): Promise<IBeautyPreferences | null>
// }
