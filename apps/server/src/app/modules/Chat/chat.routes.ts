import express, { Router } from 'express'
import { auth } from '@app/middlewares/auth'
import { validateRequest } from '@app/middlewares'
import { AuthRoles } from '@repo/db'
import { multerFactory } from 'packages/media-hub/src'
import { chatControllers } from './chat.controllers'
import { chatValidations } from './chat.validations'

const router: Router = express.Router()

const ALL_AUTHENTICATED_ROLES = [
  AuthRoles.CUSTOMER,
  AuthRoles.ARTIST,
  AuthRoles.ADMIN,
  AuthRoles.SUPER_ADMIN,
] as const

// 1. Separate API for uploading message images to S3
router.post(
  '/upload-images',
  auth(...ALL_AUTHENTICATED_ROLES),
  multerFactory({ category: 'image', maxSizeInMB: 10 }).array('images', 10),
  chatControllers.uploadMessageImages
)

// 2. Start or get a conversation (Normal: Customer <-> Artist, Support: Admin <-> Customer/Artist)
router.post(
  '/',
  auth(...ALL_AUTHENTICATED_ROLES),
  validateRequest(chatValidations.startOrGetChatSchema),
  chatControllers.startOrGetChat
)

// 3. Get conversations with filters (all, unread, today, booking_active)
router.get(
  '/',
  auth(...ALL_AUTHENTICATED_ROLES),
  validateRequest(chatValidations.getConversationsSchema),
  chatControllers.getMyConversations
)

// 4. Send message (via body.chatId or body.receiverId / body.chatType)
router.post(
  '/messages',
  auth(...ALL_AUTHENTICATED_ROLES),
  validateRequest(chatValidations.sendMessageSchema),
  chatControllers.sendMessage
)

// 5. Send message to a specific conversation ID
router.post(
  '/:chatId/messages',
  auth(...ALL_AUTHENTICATED_ROLES),
  validateRequest(chatValidations.sendMessageSchema),
  chatControllers.sendMessage
)

// 6. Get paginated messages of a conversation
router.get(
  '/:chatId/messages',
  auth(...ALL_AUTHENTICATED_ROLES),
  validateRequest(chatValidations.getMessagesSchema),
  chatControllers.getChatMessages
)

// 7. Mark conversation messages as read
router.patch(
  '/:chatId/read',
  auth(...ALL_AUTHENTICATED_ROLES),
  validateRequest(chatValidations.markAsReadSchema),
  chatControllers.markChatAsRead
)

// 8. Edit a message
router.patch(
  '/:chatId/messages/:messageId',
  auth(...ALL_AUTHENTICATED_ROLES),
  validateRequest(chatValidations.editMessageSchema),
  chatControllers.editMessage
)

// 9. Delete a message
router.delete(
  '/:chatId/messages/:messageId',
  auth(...ALL_AUTHENTICATED_ROLES),
  validateRequest(chatValidations.deleteMessageSchema),
  chatControllers.deleteMessage
)

export const chatRoutes = router

