import { Schema, model } from 'mongoose'
import type {
  IPlatformSettingsDoc,
  IPlatformSettingsModel,
  IProfessionalCancellationFees,
} from './platform-settings.interfaces'
import {
  DEFAULT_PLATFORM_SETTINGS,
  PLATFORM_SETTINGS_SINGLETON_KEY,
} from './platform-settings.constants'

// this is for professionals booking cancellation penalty handling:
const ProfessionalSettingCancellationFeeSchema = new Schema<IProfessionalCancellationFees>(
  {
    moreThan14Days: {
      type: Number,
      required: true,
      min: 0,
      default: DEFAULT_PLATFORM_SETTINGS.low.moreThan14Days,
    },
    sevenTo13Days: {
      type: Number,
      required: true,
      min: 0,
      default: DEFAULT_PLATFORM_SETTINGS.low.sevenTo13Days,
    },
    within48Hours: {
      type: Number,
      required: true,
      min: 0,
      default: DEFAULT_PLATFORM_SETTINGS.low.within48Hours,
    },
  },
  {
    versionKey: false,
    _id: false,
  }
)

const platformSettingsSchema = new Schema<IPlatformSettingsDoc, IPlatformSettingsModel>(
  {
    singletonKey: {
      type: String,
      default: PLATFORM_SETTINGS_SINGLETON_KEY,
      unique: true,
      trim: true,
    },
    platformPercentage: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
      default: DEFAULT_PLATFORM_SETTINGS.platformPercentage,
    },
    gstPercentage: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
      default: DEFAULT_PLATFORM_SETTINGS.gstPercentage,
    },
    travelingFeePerKm: {
      type: Number,
      required: true,
      min: 0,
      default: DEFAULT_PLATFORM_SETTINGS.travelingFeePerKm,
    },
    parkingFee: {
      type: Number,
      required: true,
      min: 0,
      default: DEFAULT_PLATFORM_SETTINGS.parkingFee,
    },
    peakTimeSurcharge: {
      type: Number,
      required: true,
      min: 0,
      default: DEFAULT_PLATFORM_SETTINGS.peakTimeSurcharge,
    },
    // these are for professionals booking cancellation penalty handling:
    lowMaxAmount: {
      type: Number,
      required: true,
      min: 0,
      default: DEFAULT_PLATFORM_SETTINGS.lowMaxAmount,
    },
    // these are for professionals booking cancellation penalty handling:
    mediumMaxAmount: {
      type: Number,
      required: true,
      min: 0,
      default: DEFAULT_PLATFORM_SETTINGS.mediumMaxAmount,
    },
    low: {
      type: ProfessionalSettingCancellationFeeSchema,
      required: true,
      default: () => ({ ...DEFAULT_PLATFORM_SETTINGS.low }),
    },
    medium: {
      type: ProfessionalSettingCancellationFeeSchema,
      required: true,
      default: () => ({ ...DEFAULT_PLATFORM_SETTINGS.medium }),
    },
    high: {
      type: ProfessionalSettingCancellationFeeSchema,
      required: true,
      default: () => ({ ...DEFAULT_PLATFORM_SETTINGS.high }),
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
)

// Static method to get active singleton settings (initializes with defaults if none exist)
platformSettingsSchema.statics.getSettings = async function () {
  let settings = await this.findOne({ singletonKey: PLATFORM_SETTINGS_SINGLETON_KEY })
  if (!settings) {
    settings = await this.findOne()
  }
  if (!settings) {
    settings = await this.create({
      ...DEFAULT_PLATFORM_SETTINGS,
      singletonKey: PLATFORM_SETTINGS_SINGLETON_KEY,
    })
  }
  return settings
}

export const PlatformSettings = model<IPlatformSettingsDoc, IPlatformSettingsModel>(
  'PlatformSettings',
  platformSettingsSchema
)

