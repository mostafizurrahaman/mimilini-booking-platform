import {
  ArtistProfile,
  AuthRoles,
  AuthStatus,
  Booking,
  BOOKING_STATUS,
  Chat,
  CHAT_FILTER_TYPE,
  CHAT_MESSAGE_TYPE,
  CHAT_TYPE,
  User,
  type IChatDoc,
  type IUser,
  type TChatMessageType,
  type TChatType,
} from '@repo/db'
import { AppError } from '@repo/shared'
import httpStatus from 'http-status'
import { Types } from 'mongoose'
import { uploadMultipleFileToS3 } from 'packages/media-hub/src'
import { AWS_FOLDER_NAMES } from '@app/libs/files_folder'

const ACTIVE_BOOKING_STATUSES = [
  BOOKING_STATUS.REQUESTED,
  BOOKING_STATUS.ACCEPTED,
  BOOKING_STATUS.CONFIRMED,
  BOOKING_STATUS.IN_PROGRESS,
  BOOKING_STATUS.RESCHEDULED,
]

// Online user tracker shared between socket and services
const onlineUserSockets = new Map<string, Set<string>>()

export const registerUserSocket = (userId: string, socketId: string) => {
  const key = String(userId)
  if (!onlineUserSockets.has(key)) {
    onlineUserSockets.set(key, new Set())
  }
  onlineUserSockets.get(key)!.add(socketId)
}

export const unregisterUserSocket = (userId: string, socketId: string): boolean => {
  const key = String(userId)
  const set = onlineUserSockets.get(key)
  if (!set) return false
  set.delete(socketId)
  if (set.size === 0) {
    onlineUserSockets.delete(key)
    return true // user is now completely offline
  }
  return false
}

export const isUserOnline = (userId?: string | Types.ObjectId | null): boolean => {
  if (!userId) return false
  const set = onlineUserSockets.get(String(userId))
  return Boolean(set && set.size > 0)
}

export const getOnlineUserIds = (): string[] => {
  return Array.from(onlineUserSockets.keys())
}

const isAdminRole = (role: string): boolean => {
  return role === AuthRoles.ADMIN || role === AuthRoles.SUPER_ADMIN
}

const validateObjectId = (id: string, label = 'ID') => {
  if (!Types.ObjectId.isValid(id)) {
    throw new AppError(httpStatus.BAD_REQUEST, `Invalid ${label}`)
  }
}

/**
 * Verify that the user is allowed to access/interact with this chat
 */
export const assertChatAccess = (user: IUser, chat: IChatDoc, writeAccess = false) => {
  const userIdStr = String(user._id)

  if (chat.chatType === CHAT_TYPE.SUPPORT) {
    const isOwner = chat.supportUser && String(chat.supportUser) === userIdStr
    const isAdmin = isAdminRole(user.role)
    if (!isOwner && !isAdmin) {
      throw new AppError(
        httpStatus.FORBIDDEN,
        'You do not have permission to access this support conversation'
      )
    }
    return
  }

  // Normal chat (Customer <-> Artist)
  const isCustomer = chat.customer && String(chat.customer) === userIdStr
  const isArtist = chat.artist && String(chat.artist) === userIdStr
  const isAdmin = isAdminRole(user.role)

  if (!isCustomer && !isArtist && (!isAdmin || writeAccess)) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      writeAccess
        ? 'Only the customer and artist of this conversation can send or modify messages'
        : 'You do not have permission to access this conversation'
    )
  }
}

/**
 * Determine messageType ('text' | 'image' | 'mixed') and validate content
 */
const resolveMessageContent = (text?: string | null, images?: string[]) => {
  const cleanText = text?.trim() || null
  const cleanImages = Array.isArray(images)
    ? images.map((img) => String(img).trim()).filter(Boolean)
    : []

  if (!cleanText && cleanImages.length === 0) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Message must contain either text or at least one image'
    )
  }

  if (cleanImages.length > 10) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Cannot send more than 10 images in a single message')
  }

  let messageType: TChatMessageType = CHAT_MESSAGE_TYPE.TEXT
  if (cleanText && cleanImages.length > 0) {
    messageType = CHAT_MESSAGE_TYPE.MIXED
  } else if (cleanImages.length > 0) {
    messageType = CHAT_MESSAGE_TYPE.IMAGE
  }

  return { cleanText, cleanImages, messageType }
}

/**
 * Upload chat images to S3 (Separate API for message images)
 */
const uploadMessageImages = async (files?: Express.Multer.File[]) => {
  if (!files || files.length === 0) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Please upload at least one image file in the "images" field'
    )
  }

  const uploaded = await uploadMultipleFileToS3(files, AWS_FOLDER_NAMES.ChatImages)

  return {
    images: uploaded.map((item) => item.url),
    files: uploaded,
  }
}

/**
 * Internal helper to find or create a Chat document (Normal or Support)
 */
const resolveOrCreateChatDoc = async (
  user: IUser,
  payload: {
    chatType?: TChatType | undefined
    participantId?: string | undefined
    bookingId?: string | undefined
    subject?: string | undefined
  }
): Promise<IChatDoc> => {
  const chatType: TChatType = payload.chatType || CHAT_TYPE.NORMAL
  const userId = new Types.ObjectId(String(user._id))

  let chat: IChatDoc | null = null

  if (chatType === CHAT_TYPE.SUPPORT) {
    let supportUserId: Types.ObjectId
    let supportUserRole = user.role

    if (isAdminRole(user.role)) {
      if (!payload.participantId) {
        throw new AppError(
          httpStatus.BAD_REQUEST,
          'participantId (customer or artist ID) is required when an admin starts a support chat'
        )
      }
      validateObjectId(payload.participantId, 'participantId')
      const targetUser = await User.findById(payload.participantId).lean()
      if (!targetUser || targetUser.status === AuthStatus.DELETED) {
        throw new AppError(httpStatus.NOT_FOUND, 'Target user not found')
      }
      if (isAdminRole(targetUser.role)) {
        throw new AppError(
          httpStatus.BAD_REQUEST,
          'Support chat can only be created with a customer or artist'
        )
      }
      supportUserId = new Types.ObjectId(String(targetUser._id))
      supportUserRole = targetUser.role
    } else {
      supportUserId = userId
      supportUserRole = user.role
    }

    chat = await Chat.findOne({
      chatType: CHAT_TYPE.SUPPORT,
      supportUser: supportUserId,
      isActive: true,
    })

    if (!chat) {
      const participants: Types.ObjectId[] = [supportUserId]
      if (isAdminRole(user.role) && String(supportUserId) !== String(userId)) {
        participants.push(userId)
      }

      let bookingRef: Types.ObjectId | null = null
      if (payload.bookingId) {
        validateObjectId(payload.bookingId, 'bookingId')
        bookingRef = new Types.ObjectId(payload.bookingId)
      }

      chat = await Chat.create({
        chatType: CHAT_TYPE.SUPPORT,
        participants,
        supportUser: supportUserId,
        supportUserRole,
        assignedAdmin: isAdminRole(user.role) ? userId : null,
        booking: bookingRef,
        subject: payload.subject?.trim() || 'Customer/Artist Support',
        messages: [],
        unreadByCustomer: 0,
        unreadByArtist: 0,
        unreadByAdmin: 0,
        unreadBySupportUser: 0,
        isActive: true,
      })
    } else {
      if (isAdminRole(user.role)) {
        const alreadyIn = chat.participants.some((p) => String(p) === String(userId))
        if (!alreadyIn) {
          chat.participants.push(userId)
        }
        if (!chat.assignedAdmin) {
          chat.assignedAdmin = userId
        }
      }
      if (payload.subject?.trim()) {
        chat.subject = payload.subject.trim()
      }
      if (payload.bookingId) {
        validateObjectId(payload.bookingId, 'bookingId')
        chat.booking = new Types.ObjectId(payload.bookingId)
      }
      await chat.save()
    }
    return chat
  }

  // Normal chat between Customer and Artist
  if (isAdminRole(user.role)) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Admins cannot start a normal chat. Please use chatType "support".'
    )
  }

  if (user.status === AuthStatus.SUSPENDED) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      'Your account is suspended. You can only use support chat to contact Admin until your penalty is settled.'
    )
  }

  let participantIdStr = payload.participantId?.trim()
  let bookingRef: Types.ObjectId | null = null

  if (payload.bookingId) {
    validateObjectId(payload.bookingId, 'bookingId')
    const booking = await Booking.findById(payload.bookingId).lean()
    if (!booking) {
      throw new AppError(httpStatus.NOT_FOUND, 'Booking not found')
    }
    const isBookingCustomer = String(booking.customer) === String(userId)
    const isBookingArtist = String(booking.artist) === String(userId)
    if (!isBookingCustomer && !isBookingArtist) {
      throw new AppError(httpStatus.FORBIDDEN, 'You are not a participant of this booking')
    }
    bookingRef = new Types.ObjectId(String(booking._id))
    if (!participantIdStr) {
      participantIdStr = isBookingCustomer ? String(booking.artist) : String(booking.customer)
    }
  }

  if (!participantIdStr) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'participantId (or bookingId) is required to start a normal conversation'
    )
  }

  validateObjectId(participantIdStr, 'participantId')

  if (participantIdStr === String(userId)) {
    throw new AppError(httpStatus.BAD_REQUEST, 'You cannot start a conversation with yourself')
  }

  const otherUser = await User.findById(participantIdStr).lean()
  if (!otherUser || otherUser.status === AuthStatus.DELETED) {
    throw new AppError(httpStatus.NOT_FOUND, 'Participant user not found')
  }
  if (otherUser.status === AuthStatus.BLOCKED) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Cannot chat with a blocked user')
  }

  let customerId: Types.ObjectId
  let artistId: Types.ObjectId

  if (user.role === AuthRoles.CUSTOMER && otherUser.role === AuthRoles.ARTIST) {
    customerId = userId
    artistId = new Types.ObjectId(String(otherUser._id))
  } else if (user.role === AuthRoles.ARTIST && otherUser.role === AuthRoles.CUSTOMER) {
    customerId = new Types.ObjectId(String(otherUser._id))
    artistId = userId
  } else {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Normal chat is only allowed between a Customer and an Artist. For Admin help, use chatType "support".'
    )
  }

  chat = await Chat.findOne({
    chatType: CHAT_TYPE.NORMAL,
    customer: customerId,
    artist: artistId,
    isActive: true,
  })

  if (!chat) {
    chat = await Chat.create({
      chatType: CHAT_TYPE.NORMAL,
      participants: [customerId, artistId],
      customer: customerId,
      artist: artistId,
      booking: bookingRef,
      subject: payload.subject?.trim() || null,
      messages: [],
      unreadByCustomer: 0,
      unreadByArtist: 0,
      unreadByAdmin: 0,
      unreadBySupportUser: 0,
      isActive: true,
    })
  } else if (bookingRef) {
    chat.booking = bookingRef
    await chat.save()
  }

  return chat
}

/**
 * Send a message (Text, Image, or Mixed) in an existing chat or auto-create/resolve the chat
 */
const sendMessage = async (
  user: IUser,
  payload: {
    chatId?: string | undefined
    chatType?: TChatType | undefined
    receiverId?: string | undefined
    bookingId?: string | undefined
    text?: string | undefined
    images?: string[] | undefined
  }
) => {
  const { cleanText, cleanImages, messageType } = resolveMessageContent(
    payload.text,
    payload.images
  )

  const senderId = new Types.ObjectId(String(user._id))
  let chat: IChatDoc | null = null

  if (payload.chatId) {
    validateObjectId(payload.chatId, 'chatId')
    chat = await Chat.findById(payload.chatId)
    if (!chat || !chat.isActive) {
      throw new AppError(httpStatus.NOT_FOUND, 'Conversation not found')
    }
    assertChatAccess(user, chat, true)
  } else {
    chat = await resolveOrCreateChatDoc(user, {
      chatType: payload.chatType || CHAT_TYPE.NORMAL,
      participantId: payload.receiverId,
      bookingId: payload.bookingId,
    })
  }

  if (chat.chatType === CHAT_TYPE.NORMAL && user.status === AuthStatus.SUSPENDED) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      'Your account is suspended. You can only send messages in support chat with Admin.'
    )
  }

  if (chat.chatType === CHAT_TYPE.SUPPORT && isAdminRole(user.role)) {
    const isParticipant = chat.participants.some((p) => String(p) === String(senderId))
    if (!isParticipant) {
      chat.participants.push(senderId)
    }
    if (!chat.assignedAdmin) {
      chat.assignedAdmin = senderId
    }
  }

  const now = new Date()
  const newMessageSubdoc = {
    _id: new Types.ObjectId(),
    sender: senderId,
    senderRole: user.role,
    messageType,
    text: cleanText,
    images: cleanImages,
    isRead: false,
    readBy: [senderId],
    readAt: null,
    isEdited: false,
    editedAt: null,
    isDeleted: false,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  }

  chat.messages.push(newMessageSubdoc)
  chat.lastMessage = {
    messageId: newMessageSubdoc._id,
    sender: senderId,
    senderRole: user.role,
    messageType,
    text: cleanText || (cleanImages.length > 0 ? '📷 Image' : null),
    images: cleanImages,
    sentAt: now,
  }
  chat.lastMessageAt = now

  if (chat.chatType === CHAT_TYPE.NORMAL) {
    if (String(chat.customer) === String(senderId)) {
      chat.unreadByArtist = (chat.unreadByArtist || 0) + 1
      chat.unreadByCustomer = 0
    } else {
      chat.unreadByCustomer = (chat.unreadByCustomer || 0) + 1
      chat.unreadByArtist = 0
    }
  } else {
    if (isAdminRole(user.role)) {
      chat.unreadBySupportUser = (chat.unreadBySupportUser || 0) + 1
      chat.unreadByAdmin = 0
    } else {
      chat.unreadByAdmin = (chat.unreadByAdmin || 0) + 1
      chat.unreadBySupportUser = 0
    }
  }

  await chat.save()

  const savedMessage = chat.messages[chat.messages.length - 1]
  const enrichedChat = await formatConversationForUser(chat, user)

  return {
    chat: enrichedChat,
    rawChat: chat,
    message: {
      _id: savedMessage?._id || newMessageSubdoc._id,
      chatId: chat._id,
      chatType: chat.chatType,
      sender: {
        _id: user._id,
        name: user.name,
        email: user.email,
        profileImage: user.profileImage || null,
        role: user.role,
      },
      senderRole: user.role,
      messageType,
      text: cleanText,
      images: cleanImages,
      isRead: false,
      readBy: [senderId],
      readAt: null,
      isEdited: false,
      isDeleted: false,
      createdAt: savedMessage?.createdAt || now,
      updatedAt: savedMessage?.updatedAt || now,
    },
  }
}

/**
 * Start or retrieve an existing conversation (Normal or Support)
 */
const startOrGetChat = async (
  user: IUser,
  payload: {
    chatType?: TChatType | undefined
    participantId?: string | undefined
    bookingId?: string | undefined
    subject?: string | undefined
    initialMessage?: string | undefined
    images?: string[] | undefined
  }
) => {
  const chat = await resolveOrCreateChatDoc(user, payload)

  if (
    (payload.initialMessage && payload.initialMessage.trim().length > 0) ||
    (Array.isArray(payload.images) && payload.images.length > 0)
  ) {
    const msgResult = await sendMessage(user, {
      chatId: String(chat._id),
      text: payload.initialMessage,
      images: payload.images,
    })
    return {
      chat: msgResult.chat,
      rawChat: msgResult.rawChat,
      message: msgResult.message,
    }
  }

  const enrichedChat = await formatConversationForUser(chat, user)
  return {
    chat: enrichedChat,
    rawChat: chat,
    message: null,
  }
}

/**
 * Helper to enrich a conversation document with participant details, unreadCount for caller, and active booking info
 */
const formatConversationForUser = async (
  chatDoc: IChatDoc | Record<string, unknown>,
  user: IUser
) => {
  const chat = (
    typeof (chatDoc as IChatDoc).toObject === 'function'
      ? (chatDoc as IChatDoc).toObject()
      : chatDoc
  ) as IChatDoc

  const userIdStr = String(user._id)
  const userIdsToFetch = new Set<string>()

  if (chat.customer) userIdsToFetch.add(String(chat.customer))
  if (chat.artist) userIdsToFetch.add(String(chat.artist))
  if (chat.supportUser) userIdsToFetch.add(String(chat.supportUser))
  if (chat.assignedAdmin) userIdsToFetch.add(String(chat.assignedAdmin))

  const users = await User.find({
    _id: { $in: Array.from(userIdsToFetch).map((id) => new Types.ObjectId(id)) },
  })
    .select('_id name email phone profileImage role status')
    .lean()

  const artistProfiles = await ArtistProfile.find({
    user: { $in: Array.from(userIdsToFetch).map((id) => new Types.ObjectId(id)) },
  })
    .select('user businessName')
    .lean()

  const userMap = new Map<string, Record<string, unknown>>()
  for (const u of users) {
    const profile = artistProfiles.find((ap) => String(ap.user) === String(u._id))
    userMap.set(String(u._id), {
      ...u,
      businessName: profile?.businessName || null,
      isOnline: isUserOnline(u._id),
    })
  }

  let unreadCount = 0
  let otherParticipant: Record<string, unknown> | null = null

  if (chat.chatType === CHAT_TYPE.NORMAL) {
    const isCustomer = String(chat.customer) === userIdStr
    unreadCount = isCustomer ? chat.unreadByCustomer || 0 : chat.unreadByArtist || 0
    const otherId = isCustomer ? String(chat.artist) : String(chat.customer)
    otherParticipant = userMap.get(otherId) || null
  } else {
    if (isAdminRole(user.role)) {
      unreadCount = chat.unreadByAdmin || 0
      otherParticipant = chat.supportUser ? userMap.get(String(chat.supportUser)) || null : null
    } else {
      unreadCount = chat.unreadBySupportUser || 0
      otherParticipant = chat.assignedAdmin
        ? userMap.get(String(chat.assignedAdmin)) || {
            _id: null,
            name: 'Mimilini Support Team',
            role: AuthRoles.ADMIN,
            isOnline: true,
          }
        : {
            _id: null,
            name: 'Mimilini Support Team',
            role: AuthRoles.ADMIN,
            isOnline: true,
          }
    }
  }

  let activeBooking = null
  if (chat.chatType === CHAT_TYPE.NORMAL && chat.customer && chat.artist) {
    const bookingQuery: Record<string, unknown> = {
      customer: chat.customer,
      artist: chat.artist,
      status: { $in: ACTIVE_BOOKING_STATUSES },
    }
    activeBooking = await Booking.findOne(bookingQuery)
      .sort({ scheduledDate: 1, createdAt: -1 })
      .select(
        '_id bookingNumber status scheduledDate startTime endTime serviceName pricing.totalAmount'
      )
      .lean()
  } else if (chat.booking) {
    activeBooking = await Booking.findOne({
      _id: chat.booking,
      status: { $in: ACTIVE_BOOKING_STATUSES },
    })
      .select(
        '_id bookingNumber status scheduledDate startTime endTime serviceName pricing.totalAmount'
      )
      .lean()
  }

  return {
    _id: chat._id,
    chatType: chat.chatType,
    subject: chat.subject || null,
    customer: chat.customer ? userMap.get(String(chat.customer)) || chat.customer : null,
    artist: chat.artist ? userMap.get(String(chat.artist)) || chat.artist : null,
    supportUser: chat.supportUser
      ? userMap.get(String(chat.supportUser)) || chat.supportUser
      : null,
    supportUserRole: chat.supportUserRole || null,
    assignedAdmin: chat.assignedAdmin
      ? userMap.get(String(chat.assignedAdmin)) || chat.assignedAdmin
      : null,
    otherParticipant,
    lastMessage: chat.lastMessage || null,
    lastMessageAt: chat.lastMessageAt || chat.updatedAt || chat.createdAt,
    unreadCount,
    unreadByCustomer: chat.unreadByCustomer || 0,
    unreadByArtist: chat.unreadByArtist || 0,
    unreadByAdmin: chat.unreadByAdmin || 0,
    unreadBySupportUser: chat.unreadBySupportUser || 0,
    hasActiveBooking: Boolean(activeBooking),
    activeBooking: activeBooking || null,
    createdAt: chat.createdAt,
    updatedAt: chat.updatedAt,
  }
}

/**
 * Get user's conversations with filters:
 * - all
 * - unread
 * - today
 * - booking_active (or 'booking active')
 */
const getMyConversations = async (
  user: IUser,
  query: {
    filter?: string | undefined
    chatType?: string | undefined
    searchTerm?: string | undefined
    page?: string | number | undefined
    limit?: string | number | undefined
  }
) => {
  const userId = new Types.ObjectId(String(user._id))
  const rawFilter = (query.filter || CHAT_FILTER_TYPE.ALL).trim().toLowerCase()
  const normalizedFilter =
    rawFilter === 'booking active' ? CHAT_FILTER_TYPE.BOOKING_ACTIVE : rawFilter

  const page = Math.max(1, Number(query.page) || 1)
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20))

  const andConditions: Record<string, unknown>[] = [{ isActive: true }]

  if (isAdminRole(user.role)) {
    if (query.chatType === CHAT_TYPE.NORMAL) {
      andConditions.push({ chatType: CHAT_TYPE.NORMAL })
    } else if (query.chatType === CHAT_TYPE.SUPPORT) {
      andConditions.push({ chatType: CHAT_TYPE.SUPPORT })
    } else {
      andConditions.push({
        $or: [{ chatType: CHAT_TYPE.SUPPORT }, { participants: userId }],
      })
    }
  } else if (user.role === AuthRoles.CUSTOMER) {
    if (query.chatType === CHAT_TYPE.NORMAL) {
      andConditions.push({ chatType: CHAT_TYPE.NORMAL, customer: userId })
    } else if (query.chatType === CHAT_TYPE.SUPPORT) {
      andConditions.push({ chatType: CHAT_TYPE.SUPPORT, supportUser: userId })
    } else {
      andConditions.push({
        $or: [
          { chatType: CHAT_TYPE.NORMAL, customer: userId },
          { chatType: CHAT_TYPE.SUPPORT, supportUser: userId },
        ],
      })
    }
  } else if (user.role === AuthRoles.ARTIST) {
    if (query.chatType === CHAT_TYPE.NORMAL) {
      andConditions.push({ chatType: CHAT_TYPE.NORMAL, artist: userId })
    } else if (query.chatType === CHAT_TYPE.SUPPORT) {
      andConditions.push({ chatType: CHAT_TYPE.SUPPORT, supportUser: userId })
    } else {
      andConditions.push({
        $or: [
          { chatType: CHAT_TYPE.NORMAL, artist: userId },
          { chatType: CHAT_TYPE.SUPPORT, supportUser: userId },
        ],
      })
    }
  }

  if (normalizedFilter === CHAT_FILTER_TYPE.UNREAD) {
    if (isAdminRole(user.role)) {
      andConditions.push({ unreadByAdmin: { $gt: 0 } })
    } else if (user.role === AuthRoles.CUSTOMER) {
      andConditions.push({
        $or: [
          { chatType: CHAT_TYPE.NORMAL, unreadByCustomer: { $gt: 0 } },
          { chatType: CHAT_TYPE.SUPPORT, unreadBySupportUser: { $gt: 0 } },
        ],
      })
    } else if (user.role === AuthRoles.ARTIST) {
      andConditions.push({
        $or: [
          { chatType: CHAT_TYPE.NORMAL, unreadByArtist: { $gt: 0 } },
          { chatType: CHAT_TYPE.SUPPORT, unreadBySupportUser: { $gt: 0 } },
        ],
      })
    }
  } else if (normalizedFilter === CHAT_FILTER_TYPE.TODAY) {
    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)
    const endOfToday = new Date()
    endOfToday.setHours(23, 59, 59, 999)

    andConditions.push({
      $or: [
        { lastMessageAt: { $gte: startOfToday, $lte: endOfToday } },
        { lastMessageAt: null, updatedAt: { $gte: startOfToday, $lte: endOfToday } },
      ],
    })
  } else if (normalizedFilter === CHAT_FILTER_TYPE.BOOKING_ACTIVE) {
    const bookingMatch: Record<string, unknown> = {
      status: { $in: ACTIVE_BOOKING_STATUSES },
    }
    if (user.role === AuthRoles.CUSTOMER) {
      bookingMatch.customer = userId
    } else if (user.role === AuthRoles.ARTIST) {
      bookingMatch.artist = userId
    }

    const activeBookings = await Booking.find(bookingMatch)
      .select('_id customer artist')
      .lean()

    if (activeBookings.length === 0) {
      return {
        conversations: [],
        meta: {
          page,
          limit,
          total: 0,
          totalPages: 0,
          filter: normalizedFilter,
        },
      }
    }

    const activeBookingIds = activeBookings.map((b) => b._id)
    const pairOrConditions: Record<string, unknown>[] = [
      { booking: { $in: activeBookingIds } },
    ]

    for (const b of activeBookings) {
      pairOrConditions.push({
        chatType: CHAT_TYPE.NORMAL,
        customer: b.customer,
        artist: b.artist,
      })
    }

    andConditions.push({ $or: pairOrConditions })
  }

  if (query.searchTerm && query.searchTerm.trim()) {
    const term = query.searchTerm.trim()
    const regex = new RegExp(term, 'i')

    const [matchingUsers, matchingProfiles] = await Promise.all([
      User.find({
        $or: [{ name: regex }, { email: regex }, { phone: regex }],
      })
        .select('_id')
        .lean(),
      ArtistProfile.find({ businessName: regex }).select('user').lean(),
    ])

    const matchedUserIds = [
      ...matchingUsers.map((u) => u._id),
      ...matchingProfiles.map((p) => p.user),
    ]

    andConditions.push({
      $or: [
        { participants: { $in: matchedUserIds } },
        { supportUser: { $in: matchedUserIds } },
        { subject: regex },
        { 'lastMessage.text': regex },
      ],
    })
  }

  const mongoQuery = andConditions.length === 1 ? andConditions[0]! : { $and: andConditions }

  const [total, chatDocs] = await Promise.all([
    Chat.countDocuments(mongoQuery),
    Chat.find(mongoQuery)
      .select('-messages')
      .sort({ lastMessageAt: -1, updatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
  ])

  const conversations = await Promise.all(
    chatDocs.map((chatDoc) => formatConversationForUser(chatDoc as unknown as IChatDoc, user))
  )

  return {
    conversations,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      filter: normalizedFilter,
    },
  }
}

/**
 * Get paginated messages of a single conversation
 */
const getChatMessages = async (
  user: IUser,
  chatId: string,
  query: { page?: string | number | undefined; limit?: string | number | undefined }
) => {
  validateObjectId(chatId, 'chatId')

  const chat = await Chat.findById(chatId)
  if (!chat || !chat.isActive) {
    throw new AppError(httpStatus.NOT_FOUND, 'Conversation not found')
  }

  assertChatAccess(user, chat, false)

  const page = Math.max(1, Number(query.page) || 1)
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 30))

  const allMessages = chat.messages || []
  const total = allMessages.length

  const endIndex = Math.max(0, total - (page - 1) * limit)
  const startIndex = Math.max(0, endIndex - limit)
  const slicedMessages = allMessages.slice(startIndex, endIndex)

  const senderIds = Array.from(new Set(slicedMessages.map((m) => String(m.sender))))
  const senders = await User.find({
    _id: { $in: senderIds.map((id) => new Types.ObjectId(id)) },
  })
    .select('_id name email profileImage role')
    .lean()

  const senderMap = new Map(senders.map((s) => [String(s._id), s]))

  const formattedMessages = slicedMessages.map((msg) => {
    const plain =
      typeof (msg as unknown as { toObject?: () => Record<string, unknown> }).toObject ===
      'function'
        ? (msg as unknown as { toObject: () => Record<string, unknown> }).toObject()
        : (msg as unknown as Record<string, unknown>)

    return {
      _id: plain._id,
      chatId: chat._id,
      sender: senderMap.get(String(plain.sender)) || {
        _id: plain.sender,
        role: plain.senderRole,
      },
      senderRole: plain.senderRole,
      messageType: plain.messageType,
      text: plain.isDeleted ? 'This message was deleted' : plain.text,
      images: plain.isDeleted ? [] : plain.images || [],
      isRead: plain.isRead,
      readBy: plain.readBy || [],
      readAt: plain.readAt || null,
      isEdited: plain.isEdited || false,
      editedAt: plain.editedAt || null,
      isDeleted: plain.isDeleted || false,
      deletedAt: plain.deletedAt || null,
      createdAt: plain.createdAt,
      updatedAt: plain.updatedAt,
    }
  })

  const enrichedChat = await formatConversationForUser(chat, user)

  return {
    chat: enrichedChat,
    messages: formattedMessages,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasMore: startIndex > 0,
    },
  }
}

/**
 * Mark all unread messages in a conversation as read by the current user
 */
const markChatAsRead = async (user: IUser, chatId: string) => {
  validateObjectId(chatId, 'chatId')

  const chat = await Chat.findById(chatId)
  if (!chat || !chat.isActive) {
    throw new AppError(httpStatus.NOT_FOUND, 'Conversation not found')
  }

  assertChatAccess(user, chat, false)

  const userId = new Types.ObjectId(String(user._id))
  const userIdStr = String(userId)
  const now = new Date()
  let markedCount = 0

  for (const msg of chat.messages) {
    const isFromOther =
      chat.chatType === CHAT_TYPE.SUPPORT && isAdminRole(user.role)
        ? !isAdminRole(msg.senderRole)
        : String(msg.sender) !== userIdStr

    if (isFromOther && !msg.isRead) {
      msg.isRead = true
      msg.readAt = now
      const alreadyReadBy = (msg.readBy || []).some((id) => String(id) === userIdStr)
      if (!alreadyReadBy) {
        msg.readBy.push(userId)
      }
      markedCount++
    }
  }

  if (chat.chatType === CHAT_TYPE.NORMAL) {
    if (String(chat.customer) === userIdStr) {
      chat.unreadByCustomer = 0
    } else if (String(chat.artist) === userIdStr) {
      chat.unreadByArtist = 0
    }
  } else {
    if (isAdminRole(user.role)) {
      chat.unreadByAdmin = 0
    } else if (String(chat.supportUser) === userIdStr) {
      chat.unreadBySupportUser = 0
    }
  }

  await chat.save()

  return {
    chatId: chat._id,
    chatType: chat.chatType,
    readBy: userId,
    readByRole: user.role,
    readAt: now,
    markedCount,
    rawChat: chat,
  }
}

/**
 * Edit a message's text (only the original sender can edit)
 */
const editMessage = async (user: IUser, chatId: string, messageId: string, text: string) => {
  validateObjectId(chatId, 'chatId')
  validateObjectId(messageId, 'messageId')

  const cleanText = text?.trim()
  if (!cleanText) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Message text cannot be empty')
  }

  const chat = await Chat.findById(chatId)
  if (!chat || !chat.isActive) {
    throw new AppError(httpStatus.NOT_FOUND, 'Conversation not found')
  }

  assertChatAccess(user, chat, true)

  const msg = chat.messages.find((m) => String(m._id) === String(messageId))
  if (!msg) {
    throw new AppError(httpStatus.NOT_FOUND, 'Message not found')
  }

  if (String(msg.sender) !== String(user._id)) {
    throw new AppError(httpStatus.FORBIDDEN, 'You can only edit your own messages')
  }

  if (msg.isDeleted) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Cannot edit a deleted message')
  }

  msg.text = cleanText
  msg.messageType =
    msg.images && msg.images.length > 0 ? CHAT_MESSAGE_TYPE.MIXED : CHAT_MESSAGE_TYPE.TEXT
  msg.isEdited = true
  msg.editedAt = new Date()

  if (chat.lastMessage && String(chat.lastMessage.messageId) === String(messageId)) {
    chat.lastMessage.text = cleanText
    chat.lastMessage.messageType = msg.messageType
  }

  await chat.save()

  return {
    chatId: chat._id,
    rawChat: chat,
    message: {
      _id: msg._id,
      chatId: chat._id,
      sender: msg.sender,
      senderRole: msg.senderRole,
      messageType: msg.messageType,
      text: msg.text,
      images: msg.images,
      isEdited: msg.isEdited,
      editedAt: msg.editedAt,
      updatedAt: msg.updatedAt,
    },
  }
}

/**
 * Soft-delete a message (sender or Admin can delete)
 */
const deleteMessage = async (user: IUser, chatId: string, messageId: string) => {
  validateObjectId(chatId, 'chatId')
  validateObjectId(messageId, 'messageId')

  const chat = await Chat.findById(chatId)
  if (!chat || !chat.isActive) {
    throw new AppError(httpStatus.NOT_FOUND, 'Conversation not found')
  }

  assertChatAccess(user, chat, false)

  const msg = chat.messages.find((m) => String(m._id) === String(messageId))
  if (!msg) {
    throw new AppError(httpStatus.NOT_FOUND, 'Message not found')
  }

  const isSender = String(msg.sender) === String(user._id)
  if (!isSender && !isAdminRole(user.role)) {
    throw new AppError(httpStatus.FORBIDDEN, 'You can only delete your own messages')
  }

  if (msg.isDeleted) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Message is already deleted')
  }

  msg.isDeleted = true
  msg.deletedAt = new Date()
  msg.text = null
  msg.images = []

  if (chat.lastMessage && String(chat.lastMessage.messageId) === String(messageId)) {
    chat.lastMessage.text = 'This message was deleted'
    chat.lastMessage.images = []
  }

  await chat.save()

  return {
    chatId: chat._id,
    messageId: msg._id,
    deletedBy: user._id,
    deletedAt: msg.deletedAt,
    rawChat: chat,
  }
}

export const chatServices = {
  uploadMessageImages,
  startOrGetChat,
  sendMessage,
  getMyConversations,
  getChatMessages,
  markChatAsRead,
  editMessage,
  deleteMessage,
}
