import { Document, Types } from 'mongoose'
import type { TBlockedDateType } from './artist-blocked-date.constants'

export interface IArtistBlockedDate {
  user: Types.ObjectId
  date: string
  reason: TBlockedDateType
  note?: string
}

export interface IArtistBlockedDateDoc extends Document, IArtistBlockedDate {}
