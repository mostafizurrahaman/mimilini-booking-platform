import { Schema, model } from 'mongoose'
  import type { IArtistBlockedDateDoc } from './artist-blocked-date.interfaces'

const artistBlockedDateSchema = new Schema<IArtistBlockedDateDoc>(
  {
    name: {
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