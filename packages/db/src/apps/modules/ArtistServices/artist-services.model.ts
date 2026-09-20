import { Schema, model } from 'mongoose'
import type { IArtistServicesDoc } from './artist-services.interfaces'

const artistServicesSchema = new Schema<IArtistServicesDoc>(
  {
    artist: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    category: {
      type: Schema.Types.ObjectId,
      ref: 'Category',
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    slug: {
      type: String,
      required: true,
    },
    description: {
      type: String,
    },
    durationMinutes: {
      type: Number,
      min: 1,
    },
    price: {
      type: Number,
      min: 0,
    },
    isFeatured: {
      type: Boolean,
      default: false,
    },
    isPopular: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
)

artistServicesSchema.index({
  artist: 1,
  category: 1,
  slug: 1,
})

// Static method
// artistServicesSchema.statics.getById = async function (id: string) {
//   return this.findById(id)
// }

export const ArtistServices = model<IArtistServicesDoc>('ArtistServices', artistServicesSchema)
