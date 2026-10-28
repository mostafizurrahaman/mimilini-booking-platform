import { z } from 'zod'
import { CHAT_FILTER_VALUES, CHAT_TYPE_VALUES } from '@repo/db'

const startOrGetChatSchema = z.object({
  body: z.object({
    chatType: z.enum(CHAT_TYPE_VALUES as [string, ...string[]]).optional().default('normal'),
    participantId: z.string().trim().optional(),
    bookingId: z.string().trim().optional(),
    subject: z.string().trim().max(200, 'Subject cannot exceed 200 characters').optional(),
    initialMessage: z.string().trim().max(5000, 'Message cannot exceed 5000 characters').optional(),
    images: z.array(z.string().trim().min(1)).max(10, 'Maximum 10 images per message').optional(),
  }),
})

const sendMessageSchema = z.object({
  params: z
    .object({
      chatId: z.string().trim().optional(),
    })
    .optional(),
  body: z.object({
    chatId: z.string().trim().optional(),
    chatType: z.enum(CHAT_TYPE_VALUES as [string, ...string[]]).optional(),
    receiverId: z.string().trim().optional(),
    bookingId: z.string().trim().optional(),
    text: z.string().trim().max(5000, 'Message cannot exceed 5000 characters').optional(),
    images: z.array(z.string().trim().min(1)).max(10, 'Maximum 10 images per message').optional(),
  }),
})

const getConversationsSchema = z.object({
  query: z.object({
    filter: z.enum(CHAT_FILTER_VALUES).optional().default('all'),
    chatType: z.enum(CHAT_TYPE_VALUES as [string, ...string[]]).optional(),
    searchTerm: z.string().trim().optional(),
    page: z.string().optional(),
    limit: z.string().optional(),
  }),
})

const getMessagesSchema = z.object({
  params: z.object({
    chatId: z.string().trim().min(1, 'Chat ID is required'),
  }),
  query: z.object({
    page: z.string().optional(),
    limit: z.string().optional(),
  }),
})

const markAsReadSchema = z.object({
  params: z.object({
    chatId: z.string().trim().min(1, 'Chat ID is required'),
  }),
})

const editMessageSchema = z.object({
  params: z.object({
    chatId: z.string().trim().min(1, 'Chat ID is required'),
    messageId: z.string().trim().min(1, 'Message ID is required'),
  }),
  body: z.object({
    text: z.string().trim().min(1, 'Message text cannot be empty').max(5000, 'Message cannot exceed 5000 characters'),
  }),
})

const deleteMessageSchema = z.object({
  params: z.object({
    chatId: z.string().trim().min(1, 'Chat ID is required'),
    messageId: z.string().trim().min(1, 'Message ID is required'),
  }),
})

export const chatValidations = {
  startOrGetChatSchema,
  sendMessageSchema,
  getConversationsSchema,
  getMessagesSchema,
  markAsReadSchema,
  editMessageSchema,
  deleteMessageSchema,
}

