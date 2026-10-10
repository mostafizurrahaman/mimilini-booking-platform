import { Document, Model, Types } from 'mongoose'

export interface IProfessionalCancellationFees {
  moreThan14Days: number
  sevenTo13Days: number
  within48Hours: number
}

export interface IPlatformSettings {
  singletonKey?: string
  platformPercentage: number
  gstPercentage: number
  travelingFeePerKm: number
  parkingFee: number
  peakTimeSurcharge: number
  lowMaxAmount: number
  mediumMaxAmount: number
  low: IProfessionalCancellationFees
  medium: IProfessionalCancellationFees
  high: IProfessionalCancellationFees
  updatedBy?: Types.ObjectId
}

export interface IPlatformSettingsDoc extends Document, IPlatformSettings {}

export interface IPlatformSettingsModel extends Model<IPlatformSettingsDoc> {
  getSettings(): Promise<IPlatformSettingsDoc>
}
