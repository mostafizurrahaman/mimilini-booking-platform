import { Schema, model } from 'mongoose'
import type { IArtistBlockedDateDoc } from './artist-blocked-date.interfaces'
import { blockedDateTypeValues } from './artist-blocked-date.constants'

const artistBlockedDateSchema = new Schema<IArtistBlockedDateDoc>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    date: {
      type: Date,
      required: true,
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

// Static method
// artistBlockedDateSchema.statics.getById = async function (id: string) {
//   return this.findById(id)
// }

export const ArtistBlockedDate = model<IArtistBlockedDateDoc>(
  'ArtistBlockedDate',
  artistBlockedDateSchema
)
