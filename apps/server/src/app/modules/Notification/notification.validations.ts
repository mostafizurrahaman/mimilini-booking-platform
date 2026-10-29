import { z } from 'zod'
import { DEVICE_TYPE_VALUES, NOTIFICATION_TYPE_VALUES } from '@repo/db'

const registerFcmTokenSchema = z.object({
  body: z.object({
    fcmToken: z.string().trim().min(1, 'fcmToken is required'),
    deviceType: z.enum(DEVICE_TYPE_VALUES as [string, ...string[]]).optional(),
    deviceName: z.string().trim().optional(),
  }),
})

const removeFcmTokenSchema = z.object({
  body: z.object({
    fcmToken: z.string().trim().min(1, 'fcmToken is required'),
  }),
})

const getNotificationsQuerySchema = z.object({
  query: z
    .object({
      page: z.preprocess((val) => (val !== undefined && val !== '' ? Number(val) : undefined), z.number().optional()),
      limit: z.preprocess((val) => (val !== undefined && val !== '' ? Number(val) : undefined), z.number().optional()),
      filter: z.enum(['all', 'unread', 'read']).optional(),
      type: z.enum(NOTIFICATION_TYPE_VALUES as [string, ...string[]]).optional(),
      searchTerm: z.string().trim().optional(),
    })
    .optional(),
})

const updateNotificationSettingsSchema = z.object({
  body: z.object({
    pushEnabled: z.boolean().optional(),
    emailEnabled: z.boolean().optional(),
    bookingUpdates: z.boolean().optional(),
    chatMessages: z.boolean().optional(),
    promotionsAndOffers: z.boolean().optional(),
    accountAlerts: z.boolean().optional(),
  }),
})

const adminBroadcastSchema = z.object({
  body: z.object({
    title: z.string().trim().min(1, 'Title is required').max(150, 'Title cannot exceed 150 characters'),
    message: z.string().trim().min(1, 'Message is required').max(1000, 'Message cannot exceed 1000 characters'),
    audience: z.enum(['all', 'customers', 'artists']).default('all'),
    sendPush: z.boolean().optional().default(true),
    actionUrl: z.string().trim().optional(),
    senderPicture: z.string().trim().optional(),
  }),
})

const adminGetNotificationsQuerySchema = z.object({
  query: z
    .object({
      page: z.preprocess((val) => (val !== undefined && val !== '' ? Number(val) : undefined), z.number().optional()),
      limit: z.preprocess((val) => (val !== undefined && val !== '' ? Number(val) : undefined), z.number().optional()),
      type: z.string().trim().optional(),
      searchTerm: z.string().trim().optional(),
      recipientId: z.string().trim().optional(),
    })
    .optional(),
})

export const notificationValidations = {
  registerFcmTokenSchema,
  removeFcmTokenSchema,
  getNotificationsQuerySchema,
  updateNotificationSettingsSchema,
  adminBroadcastSchema,
  adminGetNotificationsQuerySchema,
}

