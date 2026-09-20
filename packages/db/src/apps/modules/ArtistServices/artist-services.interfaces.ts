import { Document, Types } from 'mongoose'

export interface IArtistServices {
  artist: Types.ObjectId
  category: Types.ObjectId
  name: string
  slug: string
  description?: string | null
  durationMinutes: number
  price: number
  isFeatured: boolean
  isPopular: boolean
  isActive: boolean
}

export interface IArtistServicesDoc extends Document, IArtistServices {}

// export interface IArtistServicesModel extends Model<IArtistServicesDoc> {
//   getById(id: string): Promise<IArtistServices | null>
// }
