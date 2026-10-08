export const promoCodeSearchableFields = ['promotionName', 'promoCode'] as const

export const promoCodeSortableFields = [
  'promotionName',
  'promoCode',
  'discountValue',
  'minBookingValue',
  'usageLimit',
  'usageCount',
  'startDate',
  'endDate',
  'status',
  'createdAt',
  'updatedAt',
] as const

export const DISCOUNT_TYPES = {
  PERCENTAGE: 'percentage',
  FIXED: 'fixed',
} as const

export const DISCOUNT_STATUS = {
  SCHEDULED: 'scheduled',
  ACTIVE: 'active',
  PAUSE: 'pause',
  EXPIRED: 'expired',
} as const

export const DISCOUNT_TYPE_VALUES = Object.values(DISCOUNT_TYPES)
export const DISCOUNT_STATUS_VALUES = Object.values(DISCOUNT_STATUS)

// Types (optional but recommended)
export type TPromoCodeSearchableField = (typeof promoCodeSearchableFields)[number]

export type TPromoCodeSortableField = (typeof promoCodeSortableFields)[number]

export type TDiscountType = (typeof DISCOUNT_TYPES)[keyof typeof DISCOUNT_TYPES]

export type TDiscountStatusType = (typeof DISCOUNT_STATUS)[keyof typeof DISCOUNT_STATUS]
