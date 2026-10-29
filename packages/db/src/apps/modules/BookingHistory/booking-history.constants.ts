export const BOOKING_HISTORY_ROLE = {
  CUSTOMER: 'customer',
  ARTIST: 'artist',
  ADMIN: 'admin',
  SYSTEM: 'system',
} as const

export type TBookingHistoryRole =
  (typeof BOOKING_HISTORY_ROLE)[keyof typeof BOOKING_HISTORY_ROLE]
export const BOOKING_HISTORY_ROLE_VALUES = Object.values(BOOKING_HISTORY_ROLE)

export const BOOKING_TIMELINE_MILESTONE = {
  BOOKING_CREATED: 'booking_created',
  ARTIST_ACCEPTED: 'artist_accepted',
  PAYMENT_COMPLETED: 'payment_completed',
  SERVICE_STARTED: 'service_started',
  SERVICE_COMPLETED: 'service_completed',
  BOOKING_CLOSED: 'booking_closed',
  CANCELLED: 'cancelled',
  DECLINED: 'declined',
  RESCHEDULED: 'rescheduled',
  NO_SHOW_REPORTED: 'no_show_reported',
  NO_SHOW_VERIFIED: 'no_show_verified',
} as const

export type TBookingTimelineMilestone =
  (typeof BOOKING_TIMELINE_MILESTONE)[keyof typeof BOOKING_TIMELINE_MILESTONE]
export const BOOKING_TIMELINE_MILESTONE_VALUES = Object.values(
  BOOKING_TIMELINE_MILESTONE
)
