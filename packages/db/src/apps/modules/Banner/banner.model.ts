import { Schema, model } from 'mongoose'
import type { IBannerDoc } from './banner.interfaces'
import {
  BannerPriority,
  bannerPriorityValues,
  BannerStatus,
  bannerStatusValues,
} from './banner.constants'

const bannerSchema = new Schema<IBannerDoc>(
  {
    title: {
      type: String,
      required: true,
    },
    subtitle: {
      type: String,
      required: true,
    },
    url: {
      type: String,
      required: true,
    },
    ctaBtnText: {
      type: String,
      required: true,
    },
    ctaDestination: {
      type: String,
      required: true,
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
    priority: {
      type: Number,
      enum: bannerPriorityValues,
      default: BannerPriority.LOW,
    },
    status: {
      type: String,
      enum: bannerStatusValues,
      default: BannerStatus.ACTIVE,
    },
    user: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'User',
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
)

// Static method
// bannerSchema.statics.getById = async function (id: string) {
//   return this.findById(id)
// }

export const Banner = model<IBannerDoc>('Banner', bannerSchema)
