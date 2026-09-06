export const bannerSearchableFields = ['name', 'title', 'subtitle', 'status'] as const

export const bannerSortableFields = [
  'title',
  'subtitle',
  'status',
  'startDate',
  'endDate',
  'createdAt',
  'updatedAt',
] as const

export const BannerStatus = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
} as const

export const BannerPriority = {
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
} as const

export const bannerPriorityValues = Object.values(BannerPriority)
export const bannerStatusValues = Object.values(BannerStatus)

// Types (optional but recommended)
export type TBannerSearchableField = (typeof bannerSearchableFields)[number]

export type TBannerSortableField = (typeof bannerSortableFields)[number]

export type TBannerPriorityStatus = (typeof BannerPriority)[keyof typeof BannerPriority]

export type TBannerStatusType = (typeof BannerStatus)[keyof typeof BannerStatus]
