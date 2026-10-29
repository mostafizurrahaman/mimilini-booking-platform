export const NOTIFICATION_TYPE = {
  BOOKING_REQUESTED: 'booking_requested',
  BOOKING_ACCEPTED: 'booking_accepted',
  BOOKING_CONFIRMED: 'booking_confirmed',
  BOOKING_DECLINED: 'booking_declined',
  BOOKING_CANCELLED: 'booking_cancelled',
  BOOKING_RESCHEDULED: 'booking_rescheduled',
  BOOKING_REMINDER: 'booking_reminder',
  ORDER_COMPLETE: 'order_complete',
  PAYMENT_SUCCESS: 'payment_success',
  REFUND_PROCESSED: 'refund_processed',
  REVIEW_RECEIVED: 'review_received',
  CHAT_MESSAGE: 'chat_message',
  SPECIAL_OFFER: 'special_offer',
  ADMIN_BROADCAST: 'admin_broadcast',
  ACCOUNT_STATUS: 'account_status',
  GENERAL: 'general',
} as const

export const NOTIFICATION_TYPE_VALUES = Object.values(NOTIFICATION_TYPE)

export const DEVICE_TYPE = {
  IOS: 'ios',
  ANDROID: 'android',
  WEB: 'web',
  OTHER: 'other',
} as const

export const DEVICE_TYPE_VALUES = Object.values(DEVICE_TYPE)

export type TNotificationType = (typeof NOTIFICATION_TYPE)[keyof typeof NOTIFICATION_TYPE]
export type TDeviceType = (typeof DEVICE_TYPE)[keyof typeof DEVICE_TYPE]

