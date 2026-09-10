export const availabilitySearchableFields = ['name'] as const

export const availabilitySortableFields = ['createdAt', 'updatedAt'] as const

// days:
export const DAYS = {
  SUNDAY: 'sunday',
  MONDAY: 'monday',
  TUESDAY: 'tuesday',
  THURSDAY: 'thursday',
  FRIDAY: 'friday',
  SATURDAY: 'saturday',
} as const

// repeat type:
export const REPETITION_TYPES = {
  WEEKLY: 'weekly',
  MONTHLY: 'monthly',
} as const

export const daysValues = Object.values(DAYS)
export const repetitionType = Object.values(REPETITION_TYPES)
// Types (optional but recommended)
export type TAvailabilitySearchableField = (typeof availabilitySearchableFields)[number]

export type TAvailabilitySortableField = (typeof availabilitySortableFields)[number]
export type TDay = (typeof DAYS)[keyof typeof DAYS]
export type TRepeatType = (typeof REPETITION_TYPES)[keyof typeof REPETITION_TYPES]
