import { Document, Types } from 'mongoose'
import type { TDeviceType, TNotificationType } from './notification.constants'

export interface IFcmToken {
  user: Types.ObjectId
  token: string
  deviceType: TDeviceType
  deviceName?: string | null
  lastActiveAt?: Date
  createdAt?: Date
  updatedAt?: Date
}

export interface IFcmTokenDoc extends Document, IFcmToken {}

export interface INotificationSettings {
  user: Types.ObjectId
  pushEnabled: boolean
  emailEnabled: boolean
  bookingUpdates: boolean
  chatMessages: boolean
  promotionsAndOffers: boolean
  accountAlerts: boolean
  createdAt?: Date
  updatedAt?: Date
}

export interface INotificationSettingsDoc extends Document, INotificationSettings {}

export interface INotification {
  recipient: Types.ObjectId
  sender?: Types.ObjectId | null
  senderName?: string | null
  senderPicture?: string | null
  title: string
  message: string
  type: TNotificationType
  bookingId?: Types.ObjectId | null
  bookingNumber?: string | null
  chatId?: Types.ObjectId | null
  actionUrl?: string | null
  metadata?: Record<string, unknown>
  isRead: boolean
  readAt?: Date | null
  createdAt?: Date
  updatedAt?: Date
}

export interface INotificationDoc extends Document, INotification {}

