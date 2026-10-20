import { Schema, model } from 'mongoose'
import type { IArtistProfileDoc } from './artist-profile.interfaces'

const certificationSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    url: { type: String, required: true, trim: true },
    issuedAt: { type: Date },
  },
  { _id: true, versionKey: false }
)

const artistProfileSchema = new Schema<IArtistProfileDoc>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    businessName: {
      type: String,
      required: true,
    },
    abn: {
      type: String,
      required: true,
      unique: true,
    },
    isGstRegistered: { 
      type: Boolean, 
      required:true,
      default: false
    },
    businessAddress: {
      type: String,
      required: true,
    },
    yearOfExperience: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    professionalBio: {
      type: String,
    },
    drivingLicenseFrontSide: {
      type: String,
      required: true,
    },
    drivingLicenseBackSide: {
      type: String,
      required: true,
    },
    selfie: {
      type: String,
      required: true,
    },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number],
        required: true,
      },
    },
    city: {
      type: String,
      required: true,
    },
    state: {
      type: String,
      required: true,
    },
    postalCode: {
      type: String,
      required: true,
    },
    website: {
      type: String,
    },
    instagram: {
      type: String,
    },
    facebook: {
      type: String,
    },
    portfolioImages: {
      type: [String],
    },
    certifications: {
      type: [certificationSchema],
      default: [],
      validate: [
        {
          validator: (val: any[]) => !val || val.length <= 20,
          message: 'Maximum 20 certificates allowed',
        },
        {
          validator: (val: any[]) => {
            if (!val || val.length <= 1) return true
            const names = val.map((c) => c?.name?.trim().toLowerCase()).filter(Boolean)
            return new Set(names).size === names.length
          },
          message: 'Duplicate certificate names are not allowed',
        },
      ],
    },
    language: {
      type: String,
      required: true,
    },
    travelRadius: {
      type: Number, // km basis
      required: true,
      min: 0,
    },
    cancelBookingCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    isPenaltyRequired: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
)

artistProfileSchema.index({
  location: '2dsphere',
})

// Static method
// artistProfileSchema.statics.getById = async function (id: string) {
//   return this.findById(id)
// }

export const ArtistProfile = model<IArtistProfileDoc>('ArtistProfile', artistProfileSchema)
