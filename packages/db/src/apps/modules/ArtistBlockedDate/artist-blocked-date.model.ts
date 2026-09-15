import { Schema, model } from 'mongoose'
import type { IArtistBlockedDateDoc } from './artist-blocked-date.interfaces'
import { blockedDateTypeValues } from './artist-blocked-date.constants'

const artistBlockedDateSchema = new Schema<IArtistBlockedDateDoc>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    date: {
      type: String,
      required: true,
      match: [/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'],
    },
    reason: {
      type: String,
      enum: blockedDateTypeValues,
      required: true,
    },
    note: {
      type: String,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
)

artistBlockedDateSchema.index({ user: 1, date: 1 }, { unique: true })

export const ArtistBlockedDate = model<IArtistBlockedDateDoc>(
  'ArtistBlockedDate',
  artistBlockedDateSchema
)
