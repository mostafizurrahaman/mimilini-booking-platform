export const CHAT_TYPE = {
  NORMAL: 'normal',
  SUPPORT: 'support',
} as const

export const CHAT_TYPE_VALUES = Object.values(CHAT_TYPE)

export const CHAT_MESSAGE_TYPE = {
  TEXT: 'text',
  IMAGE: 'image',
  MIXED: 'mixed',
} as const

export const CHAT_MESSAGE_TYPE_VALUES = Object.values(CHAT_MESSAGE_TYPE)

export const CHAT_FILTER_TYPE = {
  ALL: 'all',
  UNREAD: 'unread',
  TODAY: 'today',
  BOOKING_ACTIVE: 'booking_active',
} as const

export const CHAT_FILTER_VALUES = [
  'all',
  'unread',
  'today',
  'booking_active',
  'booking active',
] as const

export type TChatType = (typeof CHAT_TYPE)[keyof typeof CHAT_TYPE]
export type TChatMessageType = (typeof CHAT_MESSAGE_TYPE)[keyof typeof CHAT_MESSAGE_TYPE]
export type TChatFilterType = (typeof CHAT_FILTER_VALUES)[number]

