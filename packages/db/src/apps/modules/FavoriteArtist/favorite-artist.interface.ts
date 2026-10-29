import { Document, Types } from 'mongoose'

export interface IFavoriteArtist {
  user: Types.ObjectId
  artist: Types.ObjectId
  createdAt?: Date
  updatedAt?: Date
}

export interface IFavoriteArtistDoc extends Document, IFavoriteArtist {}

