import { AppError, catchAsync, sendResponse } from '@repo/shared'
import { User, type IUser } from '@repo/db'
import httpStatus from 'http-status'
import type { Request } from 'express'
import { chatServices } from './chat.services'
import {
  emitMessageDeletedRealtime,
  emitMessageEditedRealtime,
  emitMessagesReadRealtime,
  emitNewMessageRealtime,
} from './chat.socket'

const getUserFromRequest = async (req: Request): Promise<IUser> => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const decoded = (req as any).user
  const user = await User.isUserExistByEmail(decoded.email)
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found')
  }
  return user
}

/**
 * POST /api/v1/chats/upload-images
 * Separate API for uploading message images to S3
 */
const uploadMessageImages = catchAsync(async (req, res) => {
  const files = req.files as Express.Multer.File[] | undefined
  const result = await chatServices.uploadMessageImages(files)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Chat message images uploaded successfully!',
    data: result,
  })
})

/**
 * POST /api/v1/chats
 * Start or retrieve a conversation (Normal or Support)
 */
const startOrGetChat = catchAsync(async (req, res) => {
  const user = await getUserFromRequest(req)
  const result = await chatServices.startOrGetChat(user, req.body)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Conversation retrieved successfully!',
    data: result,
  })
})

/**
 * POST /api/v1/chats/messages  OR  POST /api/v1/chats/:chatId/messages
 * Send a message (Text, Images, or Mixed)
 */
const sendMessage = catchAsync(async (req, res) => {
  const user = await getUserFromRequest(req)
  const chatId = (req.params.chatId as string | undefined) || req.body.chatId
  const result = await chatServices.sendMessage(user, {
    ...req.body,
    chatId,
  })

  emitNewMessageRealtime(
    result.rawChat,
    result.message as unknown as Record<string, unknown>,
    result.chat as unknown as Record<string, unknown>
  )

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.CREATED,
    message: 'Message sent successfully!',
    data: {
      message: result.message,
      chat: result.chat,
    },
  })
})

/**
 * GET /api/v1/chats
 * Get conversations with filter: all | unread | today | booking_active
 */
const getMyConversations = catchAsync(async (req, res) => {
  const user = await getUserFromRequest(req)
  const result = await chatServices.getMyConversations(
    user,
    req.query as Record<string, string>
  )

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Conversations retrieved successfully!',
    data: result.conversations,
    meta: result.meta,
  })
})

/**
 * GET /api/v1/chats/:chatId/messages
 * Get paginated messages of a conversation
 */
const getChatMessages = catchAsync(async (req, res) => {
  const user = await getUserFromRequest(req)
  const result = await chatServices.getChatMessages(
    user,
    req.params.chatId as string,
    req.query as Record<string, string>
  )

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Messages retrieved successfully!',
    data: {
      chat: result.chat,
      messages: result.messages,
    },
    meta: result.meta,
  })
})

/**
 * PATCH /api/v1/chats/:chatId/read
 * Mark conversation messages as read
 */
const markChatAsRead = catchAsync(async (req, res) => {
  const user = await getUserFromRequest(req)
  const result = await chatServices.markChatAsRead(user, req.params.chatId as string)

  const readPayload = {
    chatId: result.chatId,
    chatType: result.chatType,
    readBy: result.readBy,
    readByRole: result.readByRole,
    readAt: result.readAt,
    markedCount: result.markedCount,
  }

  emitMessagesReadRealtime(result.rawChat, readPayload)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Messages marked as read!',
    data: readPayload,
  })
})

/**
 * PATCH /api/v1/chats/:chatId/messages/:messageId
 * Edit a message
 */
const editMessage = catchAsync(async (req, res) => {
  const user = await getUserFromRequest(req)
  const result = await chatServices.editMessage(
    user,
    req.params.chatId as string,
    req.params.messageId as string,
    req.body.text
  )

  emitMessageEditedRealtime(
    result.rawChat,
    result.message as unknown as Record<string, unknown>
  )

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Message updated successfully!',
    data: result.message,
  })
})

/**
 * DELETE /api/v1/chats/:chatId/messages/:messageId
 * Delete a message
 */
const deleteMessage = catchAsync(async (req, res) => {
  const user = await getUserFromRequest(req)
  const result = await chatServices.deleteMessage(
    user,
    req.params.chatId as string,
    req.params.messageId as string
  )

  const deletePayload = {
    chatId: result.chatId,
    messageId: result.messageId,
    deletedBy: result.deletedBy,
    deletedAt: result.deletedAt,
  }

  emitMessageDeletedRealtime(result.rawChat, deletePayload)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Message deleted successfully!',
    data: deletePayload,
  })
})

export const chatControllers = {
  uploadMessageImages,
  startOrGetChat,
  sendMessage,
  getMyConversations,
  getChatMessages,
  markChatAsRead,
  editMessage,
  deleteMessage,
}

