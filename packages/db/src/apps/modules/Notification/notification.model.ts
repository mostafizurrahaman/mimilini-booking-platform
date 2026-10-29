import { Schema, model } from 'mongoose'
import type {
  IFcmTokenDoc,
  INotificationDoc,
  INotificationSettingsDoc,
} from './notification.interfaces'
import {
  DEVICE_TYPE,
  DEVICE_TYPE_VALUES,
  NOTIFICATION_TYPE,
  NOTIFICATION_TYPE_VALUES,
} from './notification.constants'

const fcmTokenSchema = new Schema<IFcmTokenDoc>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    token: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    deviceType: {
      type: String,
      enum: DEVICE_TYPE_VALUES,
      default: DEVICE_TYPE.ANDROID,
    },
    deviceName: {
      type: String,
      trim: true,
      default: null,
    },
    lastActiveAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
)

fcmTokenSchema.index({ user: 1, updatedAt: -1 })

export const FcmToken = model<IFcmTokenDoc>('FcmToken', fcmTokenSchema)

const notificationSettingsSchema = new Schema<INotificationSettingsDoc>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    pushEnabled: {
      type: Boolean,
      default: true,
    },
    emailEnabled: {
      type: Boolean,
      default: true,
    },
    bookingUpdates: {
      type: Boolean,
      default: true,
    },
    chatMessages: {
      type: Boolean,
      default: true,
    },
    promotionsAndOffers: {
      type: Boolean,
      default: true,
    },
    accountAlerts: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
)

export const NotificationSettings = model<INotificationSettingsDoc>(
  'NotificationSettings',
  notificationSettingsSchema
)

const notificationSchema = new Schema<INotificationDoc>(
  {
    recipient: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    sender: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    senderName: {
      type: String,
      trim: true,
      default: null,
    },
    senderPicture: {
      type: String,
      default: null,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: NOTIFICATION_TYPE_VALUES,
      default: NOTIFICATION_TYPE.GENERAL,
      index: true,
    },
    bookingId: {
      type: Schema.Types.ObjectId,
      ref: 'Booking',
      default: null,
      index: true,
    },
    bookingNumber: {
      type: String,
      trim: true,
      default: null,
      index: true,
    },
    chatId: {
      type: Schema.Types.ObjectId,
      ref: 'Chat',
      default: null,
    },
    actionUrl: {
      type: String,
      trim: true,
      default: null,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    readAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
)

notificationSchema.index({ recipient: 1, createdAt: -1 })
notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 })

export const Notification = model<INotificationDoc>('Notification', notificationSchema)

