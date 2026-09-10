export const BLOCKED_DATE_TYPES = {
  HOLIDAY: 'holiday',
  PERSONAL_WORK: 'personal_work',
  MEDICAL_LEAVE: 'medical_leave',
  PRIVATE_EVENT: 'private_event',
  OTHER: 'other',
} as const

export type TBlockedDateType = (typeof BLOCKED_DATE_TYPES)[keyof typeof BLOCKED_DATE_TYPES]

export const blockedDateTypeValues = Object.values(BLOCKED_DATE_TYPES)

export const artistBlockedDateSearchableFields = ['name'] as const

export const artistBlockedDateSortableFields = ['createdAt', 'updatedAt'] as const

// Types (optional but recommended)
export type TArtistBlockedDateSearchableField = (typeof artistBlockedDateSearchableFields)[number]

export type TArtistBlockedDateSortableField = (typeof artistBlockedDateSortableFields)[number]
