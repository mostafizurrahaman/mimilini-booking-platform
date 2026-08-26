import { Schema, model } from 'mongoose'
  import type { IArtistProfileDoc } from './artist-profile.interfaces'

const artistProfileSchema = new Schema<IArtistProfileDoc>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User", 
      required: true,
    },
    businessName: {
       type: String,
       required: true
    }, 
    abn: { 
      type: String,
      required: true
    }, 
    businessAddress: { 
      type: String,
      required: true
    }, 
    yearOfExperience: { 
      type: Number, 
      required: true, 
      min: 0, 
      default: 0
    }, 
    professionalBio: { 
      type: String
    }, 
    drivingLicenseFrontSide: { 
      type: String, 
      requried: true, 
    }, 
    drivingLicenseBackSide: { 
      type: String, 
      requried: true, 
    }, 
    selfie: { 
      type: String, 
      required: true
    }, 
    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
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
      type: [String]
    }, 
    language: { 
      type: String, 
      required: true
    }, 
    travelRadius: { 
      type: Number, // km basis 
      requried: true
    }
  
  },
  {
    timestamps: true,
    versionKey: false,
  }
)

// Static method
// artistProfileSchema.statics.getById = async function (id: string) {
//   return this.findById(id)
// }

export const ArtistProfile = model<IArtistProfileDoc>(
  'ArtistProfile',
  artistProfileSchema
)