import { Schema, model } from 'mongoose'
import type { IFavoriteArtistDoc } from './favorite-artist.interface'

const favoriteArtistSchema = new Schema<IFavoriteArtistDoc>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    artist: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
)

favoriteArtistSchema.index({ user: 1, artist: 1 }, { unique: true })
favoriteArtistSchema.index({ user: 1, createdAt: -1 })

export const FavoriteArtist = model<IFavoriteArtistDoc>('FavoriteArtist', favoriteArtistSchema)

