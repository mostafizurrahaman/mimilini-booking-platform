export const VISIT_TYPE = {
  HOME_VISIT: 'home_visit',
  SALON_VISIT: 'salon_visit',
} as const

export type TVisitType = (typeof VISIT_TYPE)[keyof typeof VISIT_TYPE]
export const VISIT_TYPE_VALUES = Object.values(VISIT_TYPE)

export const BOOKING_STATUS = {
  REQUESTED: 'requested',
  ACCEPTED: 'accepted',
  CONFIRMED: 'confirmed',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  DECLINED: 'declined',
  RESCHEDULED: 'rescheduled',
  NO_SHOW: 'no_show',
  NO_SHOW_PENDING: 'no_show_pending',
} as const

export type TBookingStatus = (typeof BOOKING_STATUS)[keyof typeof BOOKING_STATUS]
export const BOOKING_STATUS_VALUES = Object.values(BOOKING_STATUS)

export const PAYMENT_STAGE_STATUS = {
  PENDING: 'pending',
  CAPTURED: 'captured',
  FAILED: 'failed',
  REFUNDED: 'refunded',
} as const

export type TPaymentStageStatus =
  (typeof PAYMENT_STAGE_STATUS)[keyof typeof PAYMENT_STAGE_STATUS]
export const PAYMENT_STAGE_STATUS_VALUES = Object.values(PAYMENT_STAGE_STATUS)
