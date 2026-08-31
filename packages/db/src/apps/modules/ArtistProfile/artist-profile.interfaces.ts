import { Document, Types } from 'mongoose'

interface ILocation {
  type: 'Point'
  coordinates: [number, number] // [longitude, latitude]
}

export interface IArtistProfile {
  user: Types.ObjectId
  businessName: string
  abn: string // Australian Business Number
  businessAddress: string
  yearOfExperience: number
  professionalBio: string

  // Verification section:
  drivingLicenseFrontSide: string
  drivingLicenseBackSide: string
  selfie: string

  // Address info:
  location: ILocation
  city: string
  state: string
  postalCode: string
  website?: string
  instagram?: string
  facebook?: string

  // Portfolio:
  portfolioImages: string[]

  language: string
  travelRadius: number
}

export interface IArtistProfileDoc extends Document, IArtistProfile {}

// export interface IArtistProfileModel extends Model<IArtistProfileDoc> {
//   getById(id: string): Promise<IArtistProfile | null>
// }
