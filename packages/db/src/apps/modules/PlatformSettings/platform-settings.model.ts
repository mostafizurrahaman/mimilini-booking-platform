import { Schema, model } from 'mongoose'
import type {
  IPlatformSettingsDoc,
  IPlatformSettingsModel,
  IProfessionalCancellationFees,
} from './platform-settings.interfaces'

// this is for professionals booking cancellation penalty handling:
const ProfessionalSettingCancellationFeeSchema = new Schema<IProfessionalCancellationFees>(
  {
    moreThan14Days: {
      type: Number,
      required: true,
      min: 0,
    },
    sevenTo13Days: {
      type: Number,
      required: true,
      min: 0,
    },
    within48Hours: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  {
    versionKey: false,
    _id: false,
  }
)

const platformSettingsSchema = new Schema<IPlatformSettingsDoc, IPlatformSettingsModel>(
  {
    platformPercentage: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    gstPercentage: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    travelingFeePerKm: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    parkingFee: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    peakTimeSurcharge: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    // these are for professionals booking cancellation penalty handling:
    lowMaxAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    // these are for professionals booking cancellation penalty handling:
    mediumMaxAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    low: {
      type: ProfessionalSettingCancellationFeeSchema,
      required: true,
    },
    medium: {
      type: ProfessionalSettingCancellationFeeSchema,
      required: true,
    },
    high: {
      type: ProfessionalSettingCancellationFeeSchema,
      required: true,
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

// Static method to get active/latest settings singleton
platformSettingsSchema.statics.getSettings = async function () {
  return this.findOne().sort({ createdAt: -1 })
}

export const PlatformSettings = model<IPlatformSettingsDoc, IPlatformSettingsModel>(
  'PlatformSettings',
  platformSettingsSchema
)

