import httpStatus from 'http-status'
import { catchAsync, sendResponse } from '@repo/shared'
import { notificationServices } from './notification.services'

const registerFcmToken = catchAsync(async (req, res) => {
  const userId = req.user?._id
  const result = await notificationServices.registerFcmToken(userId, req.body)

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'FCM token registered successfully',
    data: result,
  })
})

const removeFcmToken = catchAsync(async (req, res) => {
  const userId = req.user?._id
  const { fcmToken } = req.body
  const result = await notificationServices.removeFcmToken(userId, fcmToken)

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'FCM token removed successfully',
    data: result,
  })
})

const getMyNotifications = catchAsync(async (req, res) => {
  const userId = req.user?._id
  const result = await notificationServices.getMyNotifications(userId, req.query as any)

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Notifications retrieved successfully',
    meta: result.meta,
    data: {
      notifications: result.data,
      unreadCount: result.unreadCount,
    },
  })
})

const getUnreadNotificationCount = catchAsync(async (req, res) => {
  const userId = req.user?._id
  const result = await notificationServices.getUnreadNotificationCount(userId)

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Unread notification count retrieved successfully',
    data: result,
  })
})

const markAsRead = catchAsync(async (req, res) => {
  const userId = req.user?._id
  const { id } = req.params
  const result = await notificationServices.markAsRead(userId, id as string)

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Notification marked as read',
    data: result,
  })
})

const markAllAsRead = catchAsync(async (req, res) => {
  const userId = req.user?._id
  const result = await notificationServices.markAllAsRead(userId)

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'All notifications marked as read',
    data: result,
  })
})

const deleteNotification = catchAsync(async (req, res) => {
  const userId = req.user?._id
  const { id } = req.params
  const result = await notificationServices.deleteNotification(userId, id as string)

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Notification deleted successfully',
    data: result,
  })
})

const clearAllNotifications = catchAsync(async (req, res) => {
  const userId = req.user?._id
  const result = await notificationServices.clearAllNotifications(userId)

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'All notifications cleared successfully',
    data: result,
  })
})

const getNotificationSettings = catchAsync(async (req, res) => {
  const userId = req.user?._id
  const result = await notificationServices.getOrCreateNotificationSettings(userId)

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Notification settings retrieved successfully',
    data: result,
  })
})

const updateNotificationSettings = catchAsync(async (req, res) => {
  const userId = req.user?._id
  const result = await notificationServices.updateNotificationSettings(userId, req.body)

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Notification settings updated successfully',
    data: result,
  })
})

const adminBroadcast = catchAsync(async (req, res) => {
  const adminUserId = req.user?._id
  const result = await notificationServices.adminBroadcastNotification(adminUserId, req.body)

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Broadcast notification sent successfully',
    data: result,
  })
})

const getAllNotificationsAdmin = catchAsync(async (req, res) => {
  const result = await notificationServices.getAllNotificationsAdmin(req.query as any)

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'All notifications retrieved successfully',
    meta: result.meta,
    data: result.data,
  })
})

export const notificationControllers = {
  registerFcmToken,
  removeFcmToken,
  getMyNotifications,
  getUnreadNotificationCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  clearAllNotifications,
  getNotificationSettings,
  updateNotificationSettings,
  adminBroadcast,
  getAllNotificationsAdmin,
}
