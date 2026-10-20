import { Document, Types } from 'mongoose'

export interface ILocation {
  type: 'Point'
  coordinates: [number, number] // [longitude, latitude]
}

export interface IArtistCertification {
  _id?: Types.ObjectId
  name: string
  url: string
  issuedAt?: Date
}

export interface IArtistProfile {
  user: Types.ObjectId
  businessName: string
  abn: string // Australian Business Number
  isGstRegistered: boolean,
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

  // Certifications:
  certifications?: IArtistCertification[]

  language: string
  travelRadius: number

  // Cancellation penalty tracking:
  cancelBookingCount: number
  isPenaltyRequired: boolean
}

export interface IArtistProfileDoc extends Document, IArtistProfile {}

// export interface IArtistProfileModel extends Model<IArtistProfileDoc> {
//   getById(id: string): Promise<IArtistProfile | null>
// }
