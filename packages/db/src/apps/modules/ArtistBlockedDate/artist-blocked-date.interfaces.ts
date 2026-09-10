import { Document, Types } from 'mongoose'
import type { TBlockedDateType } from './artist-blocked-date.constants'

export interface IArtistBlockedDate {
  user: Types.ObjectId
  date: Date
  reason: TBlockedDateType
  note?: string
}

export interface IArtistBlockedDateDoc extends Document, IArtistBlockedDate {}

// export interface IArtistBlockedDateModel extends Model<IArtistBlockedDateDoc> {
//   getById(id: string): Promise<IArtistBlockedDate | null>
// }
