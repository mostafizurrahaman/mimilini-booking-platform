export const PLATFORM_SETTINGS_SINGLETON_KEY = 'PLATFORM_SETTINGS' as const

export const DEFAULT_PLATFORM_SETTINGS = {
  platformPercentage: 20,
  gstPercentage: 10,
  travelingFeePerKm: 0,
  parkingFee: 0,
  peakTimeSurcharge: 0,
  lowMaxAmount: 200,
  mediumMaxAmount: 500,
  low: {
    moreThan14Days: 0,
    sevenTo13Days: 15,
    within48Hours: 30,
  },
  medium: {
    moreThan14Days: 15,
    sevenTo13Days: 35,
    within48Hours: 60,
  },
  high: {
    moreThan14Days: 30,
    sevenTo13Days: 60,
    within48Hours: 120,
  },
} as const

export const platformSettingsSortableFields = [
  'createdAt',
  'updatedAt',
] as const

export type TPlatformSettingsSortableField =
  (typeof platformSettingsSortableFields)[number]