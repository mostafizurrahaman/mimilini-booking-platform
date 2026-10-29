import { Types } from 'mongoose'
import httpStatus from 'http-status'
import { AppError } from '@repo/shared'
import {
  AuthRoles,
  AuthStatus,
  DEVICE_TYPE,
  FcmToken,
  Notification,
  NotificationSettings,
  NOTIFICATION_TYPE,
  User,
} from '@repo/db'
import type {
  IFcmTokenDoc,
  INotificationDoc,
  INotificationSettings,
  INotificationSettingsDoc,
  TDeviceType,
  TNotificationType,
} from '@repo/db'
import { sendFcmPushNotification } from '@app/libs/firebase'
import { getIO } from '../Chat/chat.socket'
import { logger } from '@app/libs/logger'

const calculateTimeAgo = (date: Date): string => {
  const seconds = Math.floor((new Date().getTime() - new Date(date).getTime()) / 1000)
  if (seconds < 60) return 'Just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  const weeks = Math.floor(days / 7)
  if (weeks < 4) return `${weeks}w ago`
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

export interface IRegisterFcmTokenPayload {
  fcmToken: string
  deviceType?: TDeviceType | undefined
  deviceName?: string | null | undefined
}

export interface ISendNotificationParams {
  recipient: Types.ObjectId | string
  sender?: Types.ObjectId | string | null | undefined
  senderName?: string | null | undefined
  senderPicture?: string | null | undefined
  title: string
  message: string
  type?: TNotificationType | undefined
  bookingId?: Types.ObjectId | string | null | undefined
  bookingNumber?: string | null | undefined
  chatId?: Types.ObjectId | string | null | undefined
  actionUrl?: string | null | undefined
  metadata?: Record<string, unknown> | undefined
}

/**
 * Register or update FCM Token for user.
 * DEDUPLICATION: If fcmToken is already registered in DB (under any user),
 * remove previous record before saving or re-assigning.
 */
const registerFcmToken = async (
  userId: Types.ObjectId | string,
  payload: IRegisterFcmTokenPayload
): Promise<IFcmTokenDoc> => {
  const token = payload.fcmToken?.trim()
  if (!token) {
    throw new AppError(httpStatus.BAD_REQUEST, 'fcmToken cannot be empty')
  }

  // 1. Remove any previous occurrence of this FCM token (deduplication)
  await FcmToken.deleteMany({ token })

  // 2. Create new active token record for current user
  const newFcmToken = await FcmToken.create({
    user: new Types.ObjectId(String(userId)),
    token,
    deviceType: payload.deviceType || DEVICE_TYPE.ANDROID,
    deviceName: payload.deviceName?.trim() || null,
    lastActiveAt: new Date(),
  })

  return newFcmToken
}

/**
 * Remove FCM Token on user logout or device unregistration.
 */
const removeFcmToken = async (
  userId: Types.ObjectId | string,
  fcmToken?: string
): Promise<{ removed: number }> => {
  if (fcmToken && fcmToken.trim()) {
    const result = await FcmToken.deleteMany({ token: fcmToken.trim() })
    return { removed: result.deletedCount || 0 }
  }

  // If no specific token given, remove all tokens for this user
  const result = await FcmToken.deleteMany({ user: new Types.ObjectId(String(userId)) })
  return { removed: result.deletedCount || 0 }
}

/**
 * Get or create default notification settings for user.
 */
const getOrCreateNotificationSettings = async (
  userId: Types.ObjectId | string
): Promise<INotificationSettingsDoc> => {
  const userObjectId = new Types.ObjectId(String(userId))
  let settings = await NotificationSettings.findOne({ user: userObjectId })
  if (!settings) {
    settings = await NotificationSettings.create({
      user: userObjectId,
      pushEnabled: true,
      emailEnabled: true,
      bookingUpdates: true,
      chatMessages: true,
      promotionsAndOffers: true,
      accountAlerts: true,
    })
  }
  return settings
}

/**
 * Update notification preferences/toggles.
 */
const updateNotificationSettings = async (
  userId: Types.ObjectId | string,
  payload: Partial<INotificationSettings>
): Promise<INotificationSettingsDoc> => {
  const userObjectId = new Types.ObjectId(String(userId))
  const updated = await NotificationSettings.findOneAndUpdate(
    { user: userObjectId },
    { $set: payload },
    { new: true, upsert: true, runValidators: true }
  )
  return updated
}

/**
 * Send in-app real-time notification + Firebase Cloud Messaging push.
 * Supports sender/opponent profile picture and name.
 */
const sendNotification = async (
  params: ISendNotificationParams
): Promise<INotificationDoc> => {
  const recipientId = new Types.ObjectId(String(params.recipient))
  const senderId = params.sender ? new Types.ObjectId(String(params.sender)) : null

  // 1. Save Notification record to MongoDB
  const notification = await Notification.create({
    recipient: recipientId,
    sender: senderId,
    senderName: params.senderName || null,
    senderPicture: params.senderPicture || null,
    title: params.title.trim(),
    message: params.message.trim(),
    type: params.type || NOTIFICATION_TYPE.GENERAL,
    bookingId: params.bookingId ? new Types.ObjectId(String(params.bookingId)) : null,
    bookingNumber: params.bookingNumber || null,
    chatId: params.chatId ? new Types.ObjectId(String(params.chatId)) : null,
    actionUrl: params.actionUrl || null,
    metadata: params.metadata || {},
    isRead: false,
  })

  // 2. Real-time emission via Socket.IO
  try {
    const io = getIO()
    if (io) {
      const recipientRoom = `user:${String(recipientId)}`
      const formattedNotification = {
        ...notification.toObject(),
        timeAgo: 'Just now',
      }
      io.to(recipientRoom).emit('notification:new', formattedNotification)

      const unreadCount = await Notification.countDocuments({
        recipient: recipientId,
        isRead: false,
      })
      io.to(recipientRoom).emit('notification:unread_count', { unreadCount })
    }
  } catch (socketErr) {
    logger.warn('[Notification] Failed to emit socket notification:', socketErr)
  }

  // 3. Dispatch FCM Push Notification (respecting user toggle settings)
  try {
    const settings = await getOrCreateNotificationSettings(recipientId)

    let shouldSendPush = settings.pushEnabled !== false

    // Check specific toggle category
    if (shouldSendPush) {
      const notifType = params.type || NOTIFICATION_TYPE.GENERAL
      if (
        [
          NOTIFICATION_TYPE.BOOKING_REQUESTED,
          NOTIFICATION_TYPE.BOOKING_ACCEPTED,
          NOTIFICATION_TYPE.BOOKING_CONFIRMED,
          NOTIFICATION_TYPE.BOOKING_DECLINED,
          NOTIFICATION_TYPE.BOOKING_CANCELLED,
          NOTIFICATION_TYPE.BOOKING_RESCHEDULED,
          NOTIFICATION_TYPE.BOOKING_REMINDER,
          NOTIFICATION_TYPE.ORDER_COMPLETE,
          NOTIFICATION_TYPE.PAYMENT_SUCCESS,
          NOTIFICATION_TYPE.REFUND_PROCESSED,
        ].includes(notifType as any) &&
        settings.bookingUpdates === false
      ) {
        shouldSendPush = false
      } else if (
        notifType === NOTIFICATION_TYPE.CHAT_MESSAGE &&
        settings.chatMessages === false
      ) {
        shouldSendPush = false
      } else if (
        notifType === NOTIFICATION_TYPE.SPECIAL_OFFER &&
        settings.promotionsAndOffers === false
      ) {
        shouldSendPush = false
      } else if (
        notifType === NOTIFICATION_TYPE.ACCOUNT_STATUS &&
        settings.accountAlerts === false
      ) {
        shouldSendPush = false
      }
    }

    if (shouldSendPush) {
      const tokenDocs = await FcmToken.find({ user: recipientId }).select('token')
      const tokens = tokenDocs.map((t) => t.token)

      if (tokens.length > 0) {
        const staleTokens = await sendFcmPushNotification({
          tokens,
          title: params.title,
          body: params.message,
          imageUrl: params.senderPicture || undefined,
          data: {
            notificationId: String(notification._id),
            type: String(params.type || NOTIFICATION_TYPE.GENERAL),
            bookingId: params.bookingId ? String(params.bookingId) : '',
            bookingNumber: params.bookingNumber || '',
            chatId: params.chatId ? String(params.chatId) : '',
            actionUrl: params.actionUrl || '',
            senderName: params.senderName || '',
            senderPicture: params.senderPicture || '',
          },
        })

        if (staleTokens.length > 0) {
          await FcmToken.deleteMany({ token: { $in: staleTokens } })
        }
      }
    }
  } catch (fcmErr) {
    logger.warn('[Notification] Push dispatch failed:', fcmErr)
  }

  return notification
}

/**
 * Get current user's notifications with pagination, filters, and human-readable time.
 */
const getMyNotifications = async (
  userId: Types.ObjectId | string,
  query: {
    page?: number
    limit?: number
    filter?: 'all' | 'unread' | 'read'
    type?: string
    searchTerm?: string
  }
) => {
  const page = Math.max(1, Number(query.page) || 1)
  const limit = Math.max(1, Math.min(100, Number(query.limit) || 20))
  const skip = (page - 1) * limit

  const filterCond: Record<string, unknown> = {
    recipient: new Types.ObjectId(String(userId)),
  }

  if (query.filter === 'unread') {
    filterCond.isRead = false
  } else if (query.filter === 'read') {
    filterCond.isRead = true
  }

  if (query.type) {
    filterCond.type = query.type
  }

  if (query.searchTerm && query.searchTerm.trim()) {
    const term = query.searchTerm.trim()
    filterCond.$or = [
      { title: { $regex: term, $options: 'i' } },
      { message: { $regex: term, $options: 'i' } },
      { bookingNumber: { $regex: term, $options: 'i' } },
    ]
  }

  const [notifications, total, unreadCount] = await Promise.all([
    Notification.find(filterCond).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Notification.countDocuments(filterCond),
    Notification.countDocuments({
      recipient: new Types.ObjectId(String(userId)),
      isRead: false,
    }),
  ])

  const formattedNotifications = notifications.map((n) => ({
    ...n,
    timeAgo: n.createdAt ? calculateTimeAgo(n.createdAt) : 'Recently',
  }))

  return {
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
    data: formattedNotifications,
    unreadCount,
  }
}

/**
 * Get unread & total count of notifications for user.
 */
const getUnreadNotificationCount = async (
  userId: Types.ObjectId | string
): Promise<{ unreadCount: number; totalCount: number }> => {
  const userObjectId = new Types.ObjectId(String(userId))
  const [unreadCount, totalCount] = await Promise.all([
    Notification.countDocuments({ recipient: userObjectId, isRead: false }),
    Notification.countDocuments({ recipient: userObjectId }),
  ])
  return { unreadCount, totalCount }
}

/**
 * Mark a single notification as read.
 */
const markAsRead = async (
  userId: Types.ObjectId | string,
  notificationId: string
): Promise<INotificationDoc> => {
  const userObjectId = new Types.ObjectId(String(userId))
  const notification = await Notification.findOneAndUpdate(
    { _id: new Types.ObjectId(notificationId), recipient: userObjectId },
    { isRead: true, readAt: new Date() },
    { new: true }
  )

  if (!notification) {
    throw new AppError(httpStatus.NOT_FOUND, 'Notification not found')
  }

  // Update real-time unread count
  try {
    const io = getIO()
    if (io) {
      const unreadCount = await Notification.countDocuments({
        recipient: userObjectId,
        isRead: false,
      })
      io.to(`user:${String(userObjectId)}`).emit('notification:unread_count', { unreadCount })
    }
  } catch {
    // ignore
  }

  return notification
}

/**
 * Mark all notifications for user as read.
 */
const markAllAsRead = async (
  userId: Types.ObjectId | string
): Promise<{ updatedCount: number }> => {
  const userObjectId = new Types.ObjectId(String(userId))
  const result = await Notification.updateMany(
    { recipient: userObjectId, isRead: false },
    { isRead: true, readAt: new Date() }
  )

  try {
    const io = getIO()
    if (io) {
      io.to(`user:${String(userObjectId)}`).emit('notification:unread_count', { unreadCount: 0 })
    }
  } catch {
    // ignore
  }

  return { updatedCount: result.modifiedCount || 0 }
}

/**
 * Delete a single notification.
 */
const deleteNotification = async (
  userId: Types.ObjectId | string,
  notificationId: string
): Promise<{ success: boolean }> => {
  const userObjectId = new Types.ObjectId(String(userId))
  const result = await Notification.findOneAndDelete({
    _id: new Types.ObjectId(notificationId),
    recipient: userObjectId,
  })

  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, 'Notification not found')
  }

  try {
    const io = getIO()
    if (io) {
      const unreadCount = await Notification.countDocuments({
        recipient: userObjectId,
        isRead: false,
      })
      io.to(`user:${String(userObjectId)}`).emit('notification:unread_count', { unreadCount })
    }
  } catch {
    // ignore
  }

  return { success: true }
}

/**
 * Clear all notifications for user.
 */
const clearAllNotifications = async (
  userId: Types.ObjectId | string
): Promise<{ deletedCount: number }> => {
  const userObjectId = new Types.ObjectId(String(userId))
  const result = await Notification.deleteMany({ recipient: userObjectId })

  try {
    const io = getIO()
    if (io) {
      io.to(`user:${String(userObjectId)}`).emit('notification:unread_count', { unreadCount: 0 })
    }
  } catch {
    // ignore
  }

  return { deletedCount: result.deletedCount || 0 }
}

/**
 * Admin broadcast notification to audiences: 'all', 'customers', or 'artists'.
 * Matches Figma Admin/12.png Send Notification flow.
 */
const adminBroadcastNotification = async (
  adminUserId: Types.ObjectId | string,
  payload: {
    title: string
    message: string
    audience: 'all' | 'customers' | 'artists'
    sendPush?: boolean
    actionUrl?: string
    senderPicture?: string
  }
) => {
  const userQuery: Record<string, unknown> = {
    status: AuthStatus.ACTIVE,
  }

  if (payload.audience === 'customers') {
    userQuery.role = AuthRoles.CUSTOMER
  } else if (payload.audience === 'artists') {
    userQuery.role = AuthRoles.ARTIST
  } else {
    userQuery.role = { $in: [AuthRoles.CUSTOMER, AuthRoles.ARTIST] }
  }

  const users = await User.find(userQuery).select('_id').lean()
  if (users.length === 0) {
    return {
      totalRecipients: 0,
      title: payload.title,
      audience: payload.audience,
    }
  }

  const adminUser = await User.findById(adminUserId).select('name profileImage').lean()

  const notificationsToInsert = users.map((u) => ({
    recipient: u._id,
    sender: new Types.ObjectId(String(adminUserId)),
    senderName: adminUser?.name || 'Mimilini Admin',
    senderPicture: payload.senderPicture || adminUser?.profileImage || null,
    title: payload.title.trim(),
    message: payload.message.trim(),
    type: NOTIFICATION_TYPE.ADMIN_BROADCAST,
    actionUrl: payload.actionUrl || null,
    isRead: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  }))

  // Bulk insert in chunks
  const chunkSize = 500
  for (let i = 0; i < notificationsToInsert.length; i += chunkSize) {
    await Notification.insertMany(notificationsToInsert.slice(i, i + chunkSize))
  }

  // Real-time broadcast
  try {
    const io = getIO()
    if (io) {
      const broadcastData = {
        title: payload.title,
        message: payload.message,
        type: NOTIFICATION_TYPE.ADMIN_BROADCAST,
        senderName: adminUser?.name || 'Mimilini Admin',
        senderPicture: payload.senderPicture || adminUser?.profileImage || null,
        timeAgo: 'Just now',
      }

      if (payload.audience === 'customers') {
        io.to('role:customer').emit('notification:new', broadcastData)
      } else if (payload.audience === 'artists') {
        io.to('role:artist').emit('notification:new', broadcastData)
      } else {
        io.emit('notification:new', broadcastData)
      }
    }
  } catch (err) {
    logger.warn('[Notification] Broadcast socket failed:', err)
  }

  // Push notifications if requested
  if (payload.sendPush !== false) {
    const recipientIds = users.map((u) => u._id)
    const tokenDocs = await FcmToken.find({ user: { $in: recipientIds } }).select('token')
    const tokens = tokenDocs.map((t) => t.token)

    if (tokens.length > 0) {
      const staleTokens = await sendFcmPushNotification({
        tokens,
        title: payload.title,
        body: payload.message,
        imageUrl: payload.senderPicture || adminUser?.profileImage || undefined,
        data: {
          type: NOTIFICATION_TYPE.ADMIN_BROADCAST,
          actionUrl: payload.actionUrl || '',
        },
      })

      if (staleTokens.length > 0) {
        await FcmToken.deleteMany({ token: { $in: staleTokens } })
      }
    }
  }

  return {
    totalRecipients: users.length,
    title: payload.title,
    audience: payload.audience,
  }
}

/**
 * Admin: View all sent notifications across system with search & pagination.
 */
const getAllNotificationsAdmin = async (query: {
  page?: number
  limit?: number
  type?: string
  searchTerm?: string
  recipientId?: string
}) => {
  const page = Math.max(1, Number(query.page) || 1)
  const limit = Math.max(1, Math.min(100, Number(query.limit) || 20))
  const skip = (page - 1) * limit

  const filterCond: Record<string, unknown> = {}

  if (query.recipientId) {
    filterCond.recipient = new Types.ObjectId(query.recipientId)
  }

  if (query.type) {
    filterCond.type = query.type
  }

  if (query.searchTerm && query.searchTerm.trim()) {
    const term = query.searchTerm.trim()
    filterCond.$or = [
      { title: { $regex: term, $options: 'i' } },
      { message: { $regex: term, $options: 'i' } },
      { senderName: { $regex: term, $options: 'i' } },
      { bookingNumber: { $regex: term, $options: 'i' } },
    ]
  }

  const [notifications, total] = await Promise.all([
    Notification.find(filterCond)
      .populate('recipient', 'name email role profileImage')
      .populate('sender', 'name email role profileImage')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Notification.countDocuments(filterCond),
  ])

  return {
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
    data: notifications,
  }
}

export const notificationServices = {
  registerFcmToken,
  removeFcmToken,
  getOrCreateNotificationSettings,
  updateNotificationSettings,
  sendNotification,
  getMyNotifications,
  getUnreadNotificationCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  clearAllNotifications,
  adminBroadcastNotification,
  getAllNotificationsAdmin,
}
