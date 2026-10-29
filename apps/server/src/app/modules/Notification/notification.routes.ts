import express, { Router } from 'express'
import { auth } from '@app/middlewares/auth'
import { validateRequest } from '@app/middlewares'
import { AuthRoles } from '@repo/db'
import { notificationControllers } from './notification.controllers'
import { notificationValidations } from './notification.validations'

const router: Router = express.Router()

// 1. FCM Token Management
router.post(
  '/fcm-token',
  auth(),
  validateRequest(notificationValidations.registerFcmTokenSchema),
  notificationControllers.registerFcmToken
)

router.delete(
  '/fcm-token',
  auth(),
  validateRequest(notificationValidations.removeFcmTokenSchema),
  notificationControllers.removeFcmToken
)

// 2. Notification Settings / Preferences
router.get('/settings', auth(), notificationControllers.getNotificationSettings)

router.patch(
  '/settings',
  auth(),
  validateRequest(notificationValidations.updateNotificationSettingsSchema),
  notificationControllers.updateNotificationSettings
)

// 3. Unread Count & Batch Operations
router.get('/unread-count', auth(), notificationControllers.getUnreadNotificationCount)

router.patch('/mark-all-read', auth(), notificationControllers.markAllAsRead)

router.delete('/clear-all', auth(), notificationControllers.clearAllNotifications)

// 4. Admin Endpoints
router.post(
  '/admin/broadcast',
  auth(AuthRoles.ADMIN, AuthRoles.SUPER_ADMIN),
  validateRequest(notificationValidations.adminBroadcastSchema),
  notificationControllers.adminBroadcast
)

router.get(
  '/admin/all',
  auth(AuthRoles.ADMIN, AuthRoles.SUPER_ADMIN),
  validateRequest(notificationValidations.adminGetNotificationsQuerySchema),
  notificationControllers.getAllNotificationsAdmin
)

// 5. Single Notification Actions
router.patch('/:id/read', auth(), notificationControllers.markAsRead)

router.delete('/:id', auth(), notificationControllers.deleteNotification)

// 6. List My Notifications (All / Filtered / Paginated)
router.get(
  '/',
  auth(),
  validateRequest(notificationValidations.getNotificationsQuerySchema),
  notificationControllers.getMyNotifications
)

export const notificationRoutes = router

