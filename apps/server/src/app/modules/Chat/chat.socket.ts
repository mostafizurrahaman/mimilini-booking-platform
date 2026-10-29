import { Server as HttpServer } from 'http'
import { Server as SocketIOServer, type Socket } from 'socket.io'
import { verifyToken } from '@repo/shared'
import {
  AuthRoles,
  AuthStatus,
  Chat,
  CHAT_TYPE,
  User,
  type IChatDoc,
  type IUser,
  type TChatType,
} from '@repo/db'
import configs from '@app/configs'
import { logger } from '@app/libs/logger'
import {
  assertChatAccess,
  chatServices,
  getOnlineUserIds,
  registerUserSocket,
  unregisterUserSocket,
} from './chat.services'

let io: SocketIOServer | null = null

export const getIO = (): SocketIOServer | null => io

const extractSocketToken = (socket: Socket): string | null => {
  const authToken = socket.handshake.auth?.token
  if (typeof authToken === 'string' && authToken.trim()) {
    return authToken.startsWith('Bearer ')
      ? authToken.slice(7).trim()
      : authToken.trim()
  }

  const headerAuth = socket.handshake.headers?.authorization
  if (typeof headerAuth === 'string' && headerAuth.trim()) {
    return headerAuth.startsWith('Bearer ')
      ? headerAuth.slice(7).trim()
      : headerAuth.trim()
  }

  const queryToken = socket.handshake.query?.token
  if (typeof queryToken === 'string' && queryToken.trim()) {
    return queryToken.startsWith('Bearer ')
      ? queryToken.slice(7).trim()
      : queryToken.trim()
  }

  return null
}

const parsePayload = <T = Record<string, unknown>>(raw: unknown): T => {
  if (!raw) return {} as T
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as T
    } catch {
      return { text: raw } as unknown as T
    }
  }
  if (typeof raw === 'object') {
    return raw as T
  }
  return {} as T
}

const emitTargetRooms = (chat: IChatDoc | Record<string, unknown>): string[] => {
  const rooms = new Set<string>()
  if (chat._id) {
    rooms.add(`chat:${String(chat._id)}`)
  }
  if (chat.customer) {
    rooms.add(`user:${String(chat.customer)}`)
  }
  if (chat.artist) {
    rooms.add(`user:${String(chat.artist)}`)
  }
  if (chat.supportUser) {
    rooms.add(`user:${String(chat.supportUser)}`)
  }
  if (chat.assignedAdmin) {
    rooms.add(`user:${String(chat.assignedAdmin)}`)
  }
  if (Array.isArray(chat.participants)) {
    for (const p of chat.participants) {
      rooms.add(`user:${String(p)}`)
    }
  }
  if (chat.chatType === CHAT_TYPE.SUPPORT) {
    rooms.add('role:admin')
  }
  return Array.from(rooms)
}

export const emitNewMessageRealtime = (
  rawChat: IChatDoc,
  messagePayload: Record<string, unknown>,
  conversationSummary: Record<string, unknown>
) => {
  if (!io) return
  const rooms = emitTargetRooms(rawChat)
  for (const room of rooms) {
    io.to(room).emit('chat:new_message', messagePayload)
    io.to(room).emit('chat:conversation_updated', {
      chatId: rawChat._id,
      chatType: rawChat.chatType,
      lastMessage: rawChat.lastMessage,
      lastMessageAt: rawChat.lastMessageAt,
      unreadByCustomer: rawChat.unreadByCustomer,
      unreadByArtist: rawChat.unreadByArtist,
      unreadByAdmin: rawChat.unreadByAdmin,
      unreadBySupportUser: rawChat.unreadBySupportUser,
      conversation: conversationSummary,
    })
  }
}

export const emitMessagesReadRealtime = (
  rawChat: IChatDoc,
  readPayload: Record<string, unknown>
) => {
  if (!io) return
  const rooms = emitTargetRooms(rawChat)
  for (const room of rooms) {
    io.to(room).emit('chat:messages_read', readPayload)
    io.to(room).emit('chat:conversation_updated', {
      chatId: rawChat._id,
      chatType: rawChat.chatType,
      unreadByCustomer: rawChat.unreadByCustomer,
      unreadByArtist: rawChat.unreadByArtist,
      unreadByAdmin: rawChat.unreadByAdmin,
      unreadBySupportUser: rawChat.unreadBySupportUser,
    })
  }
}

export const emitMessageEditedRealtime = (
  rawChat: IChatDoc,
  messagePayload: Record<string, unknown>
) => {
  if (!io) return
  const rooms = emitTargetRooms(rawChat)
  for (const room of rooms) {
    io.to(room).emit('chat:message_edited', messagePayload)
  }
}

export const emitMessageDeletedRealtime = (
  rawChat: IChatDoc,
  deletePayload: Record<string, unknown>
) => {
  if (!io) return
  const rooms = emitTargetRooms(rawChat)
  for (const room of rooms) {
    io.to(room).emit('chat:message_deleted', deletePayload)
  }
}

export const initSocketServer = (httpServer: HttpServer): SocketIOServer => {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST', 'PATCH', 'DELETE'],
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  })

  // Socket Authentication Middleware
  io.use(async (socket, next) => {
    try {
      const token = extractSocketToken(socket)
      if (!token) {
        return next(new Error('Authentication error: Access token is missing'))
      }

      const decoded = verifyToken(token, configs.jwt.accessToken.secret)
      if (!decoded?.email) {
        return next(new Error('Authentication error: Invalid access token'))
      }

      const user = await User.isUserExistByEmail(decoded.email)
      if (!user) {
        return next(new Error('Authentication error: User not found'))
      }

      if (user.status === AuthStatus.BLOCKED) {
        return next(new Error('Authentication error: Your account has been blocked'))
      }

      if (user.status === AuthStatus.DELETED) {
        return next(new Error('Authentication error: Your account has been deleted'))
      }

      if (!user.isOtpVerified) {
        return next(new Error('Authentication error: Please verify your account OTP'))
      }

      if (
        user.passwordChangedAt &&
        (await User.isJwtIssuedBeforePasswordChanged(
          user.passwordChangedAt,
          decoded.iat as number
        ))
      ) {
        return next(new Error('Authentication error: Token has expired. Please log in again'))
      }

      socket.data.user = user
      next()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unauthorized socket connection'
      next(new Error(`Authentication error: ${message}`))
    }
  })

  io.on('connection', (socket: Socket) => {
    const user = socket.data.user as IUser
    const userIdStr = String(user._id)

    // Register online presence and join personal room
    registerUserSocket(userIdStr, socket.id)
    socket.join(`user:${userIdStr}`)

    if (user.role === AuthRoles.ADMIN || user.role === AuthRoles.SUPER_ADMIN) {
      socket.join('role:admin')
    } else if (user.role === AuthRoles.ARTIST) {
      socket.join('role:artist')
    } else if (user.role === AuthRoles.CUSTOMER) {
      socket.join('role:customer')
    }

    logger.info(`🔌 Socket connected: ${user.name} (${user.role}) [${socket.id}]`)

    // Notify connected client of successful connection
    socket.emit('chat:connected', {
      success: true,
      message: 'Connected to Mimilini real-time chat server',
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      socketId: socket.id,
    })

    // Broadcast online status
    socket.broadcast.emit('user:online', {
      userId: userIdStr,
      role: user.role,
      isOnline: true,
    })

    const handleSocketError = (
      event: string,
      error: unknown,
      ack?: (response: Record<string, unknown>) => void
    ) => {
      const message = error instanceof Error ? error.message : 'Something went wrong'
      const errorPayload = {
        success: false,
        event,
        message,
      }
      socket.emit('chat:error', errorPayload)
      if (typeof ack === 'function') {
        ack(errorPayload)
      }
    }

    /**
     * 1. Join a specific conversation room
     * Event: chat:join
     * Payload: { "chatId": "..." }
     */
    socket.on('chat:join', async (rawPayload, ack) => {
      try {
        const payload = parsePayload<{ chatId?: string }>(rawPayload)
        if (!payload.chatId) {
          throw new Error('chatId is required to join a conversation')
        }

        const chat = await Chat.findById(payload.chatId)
        if (!chat || !chat.isActive) {
          throw new Error('Conversation not found')
        }

        assertChatAccess(user, chat, false)

        const roomName = `chat:${String(chat._id)}`
        await socket.join(roomName)

        const response = {
          success: true,
          message: 'Joined conversation room successfully',
          chatId: String(chat._id),
          chatType: chat.chatType,
          room: roomName,
        }
        socket.emit('chat:joined', response)
        if (typeof ack === 'function') ack(response)
      } catch (error) {
        handleSocketError('chat:join', error, ack)
      }
    })

    /**
     * 2. Leave a specific conversation room
     * Event: chat:leave
     * Payload: { "chatId": "..." }
     */
    socket.on('chat:leave', async (rawPayload, ack) => {
      try {
        const payload = parsePayload<{ chatId?: string }>(rawPayload)
        if (!payload.chatId) {
          throw new Error('chatId is required to leave a conversation')
        }

        const roomName = `chat:${String(payload.chatId)}`
        await socket.leave(roomName)

        const response = {
          success: true,
          message: 'Left conversation room successfully',
          chatId: String(payload.chatId),
        }
        socket.emit('chat:left', response)
        if (typeof ack === 'function') ack(response)
      } catch (error) {
        handleSocketError('chat:leave', error, ack)
      }
    })

    /**
     * 3. Send a message (Normal or Support, Text / Image / Mixed)
     * Event: chat:send_message
     * Payload: { "chatId"?: "...", "chatType"?: "normal" | "support", "receiverId"?: "...", "bookingId"?: "...", "text"?: "...", "images"?: ["https://..."] }
     */
    socket.on('chat:send_message', async (rawPayload, ack) => {
      try {
        const payload = parsePayload<{
          chatId?: string
          chatType?: TChatType
          receiverId?: string
          bookingId?: string
          text?: string
          images?: string[]
        }>(rawPayload)

        const result = await chatServices.sendMessage(user, payload)

        // Ensure sender socket is in the conversation room
        await socket.join(`chat:${String(result.rawChat._id)}`)

        emitNewMessageRealtime(
          result.rawChat,
          result.message as unknown as Record<string, unknown>,
          result.chat as unknown as Record<string, unknown>
        )

        const response = {
          success: true,
          message: 'Message sent successfully',
          data: result.message,
          chat: result.chat,
        }
        if (typeof ack === 'function') ack(response)
      } catch (error) {
        handleSocketError('chat:send_message', error, ack)
      }
    })

    /**
     * 4. Mark messages in a conversation as read
     * Event: chat:mark_read
     * Payload: { "chatId": "..." }
     */
    socket.on('chat:mark_read', async (rawPayload, ack) => {
      try {
        const payload = parsePayload<{ chatId?: string }>(rawPayload)
        if (!payload.chatId) {
          throw new Error('chatId is required to mark messages as read')
        }

        const result = await chatServices.markChatAsRead(user, payload.chatId)

        const readPayload = {
          chatId: result.chatId,
          chatType: result.chatType,
          readBy: result.readBy,
          readByRole: result.readByRole,
          readAt: result.readAt,
          markedCount: result.markedCount,
        }

        emitMessagesReadRealtime(result.rawChat, readPayload)

        const response = {
          success: true,
          message: 'Messages marked as read',
          data: readPayload,
        }
        if (typeof ack === 'function') ack(response)
      } catch (error) {
        handleSocketError('chat:mark_read', error, ack)
      }
    })

    /**
     * 5. Typing indicator
     * Event: chat:typing
     * Payload: { "chatId": "...", "isTyping": true }
     */
    socket.on('chat:typing', async (rawPayload, ack) => {
      try {
        const payload = parsePayload<{ chatId?: string; isTyping?: boolean }>(rawPayload)
        if (!payload.chatId) {
          throw new Error('chatId is required for typing indicator')
        }

        const chat = await Chat.findById(payload.chatId).select(
          '_id chatType customer artist supportUser assignedAdmin participants isActive'
        )
        if (!chat || !chat.isActive) {
          throw new Error('Conversation not found')
        }

        assertChatAccess(user, chat, false)

        const typingEventData = {
          chatId: String(chat._id),
          userId: userIdStr,
          name: user.name,
          role: user.role,
          isTyping: Boolean(payload.isTyping),
        }

        const rooms = emitTargetRooms(chat)
        for (const room of rooms) {
          socket.to(room).emit('chat:user_typing', typingEventData)
        }

        if (typeof ack === 'function') {
          ack({ success: true, data: typingEventData })
        }
      } catch (error) {
        handleSocketError('chat:typing', error, ack)
      }
    })

    /**
     * 6. Edit a message
     * Event: chat:edit_message
     * Payload: { "chatId": "...", "messageId": "...", "text": "Updated message" }
     */
    socket.on('chat:edit_message', async (rawPayload, ack) => {
      try {
        const payload = parsePayload<{
          chatId?: string
          messageId?: string
          text?: string
        }>(rawPayload)

        if (!payload.chatId || !payload.messageId || !payload.text) {
          throw new Error('chatId, messageId, and text are required to edit a message')
        }

        const result = await chatServices.editMessage(
          user,
          payload.chatId,
          payload.messageId,
          payload.text
        )

        emitMessageEditedRealtime(
          result.rawChat,
          result.message as unknown as Record<string, unknown>
        )

        const response = {
          success: true,
          message: 'Message edited successfully',
          data: result.message,
        }
        if (typeof ack === 'function') ack(response)
      } catch (error) {
        handleSocketError('chat:edit_message', error, ack)
      }
    })

    /**
     * 7. Delete a message
     * Event: chat:delete_message
     * Payload: { "chatId": "...", "messageId": "..." }
     */
    socket.on('chat:delete_message', async (rawPayload, ack) => {
      try {
        const payload = parsePayload<{ chatId?: string; messageId?: string }>(rawPayload)
        if (!payload.chatId || !payload.messageId) {
          throw new Error('chatId and messageId are required to delete a message')
        }

        const result = await chatServices.deleteMessage(
          user,
          payload.chatId,
          payload.messageId
        )

        const deletePayload = {
          chatId: result.chatId,
          messageId: result.messageId,
          deletedBy: result.deletedBy,
          deletedAt: result.deletedAt,
        }

        emitMessageDeletedRealtime(result.rawChat, deletePayload)

        const response = {
          success: true,
          message: 'Message deleted successfully',
          data: deletePayload,
        }
        if (typeof ack === 'function') ack(response)
      } catch (error) {
        handleSocketError('chat:delete_message', error, ack)
      }
    })

    /**
     * 8. Get online users list
     * Event: chat:online_users
     */
    socket.on('chat:online_users', (_rawPayload, ack) => {
      const onlineUsers = getOnlineUserIds()
      const response = {
        success: true,
        onlineUsers,
      }
      socket.emit('chat:online_users_list', response)
      if (typeof ack === 'function') ack(response)
    })

    socket.on('disconnect', () => {
      const isCompletelyOffline = unregisterUserSocket(userIdStr, socket.id)
      if (isCompletelyOffline) {
        socket.broadcast.emit('user:offline', {
          userId: userIdStr,
          role: user.role,
          isOnline: false,
          lastSeenAt: new Date(),
        })
      }
      logger.info(`🔌 Socket disconnected: ${user.name} [${socket.id}]`)
    })
  })

  return io
}
