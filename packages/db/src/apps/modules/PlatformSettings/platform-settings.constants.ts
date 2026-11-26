export const PLATFORM_SETTINGS_SINGLETON_KEY = 'PLATFORM_SETTINGS' as const

export const DEFAULT_PLATFORM_SETTINGS = {
  platformPercentage: 20,
  gstPercentage: 10,
  travelingFeePerKm: 0,
  parkingFee: 0,
  peakTimeSurcharge: 0,
  lowMaxAmount: 300,
  mediumMaxAmount: 1500,
  low: {
    moreThan14Days: 20,
    sevenTo13Days: 30,
    within48Hours: 50,
  },
  medium: {
    moreThan14Days: 50,
    sevenTo13Days: 50,
    within48Hours: 100,
  },
  high: {
    moreThan14Days: 50,
    sevenTo13Days: 100,
    within48Hours: 250,
  },
} as const

export const platformSettingsSortableFields = [
  'createdAt',
  'updatedAt',
] as const

export type TPlatformSettingsSortableField =
  (typeof platformSettingsSortableFields)[number]