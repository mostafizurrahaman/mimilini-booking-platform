import { Document, Types } from 'mongoose'
import type { TChatMessageType, TChatType } from './chat.constants'
import type { TAuthRole } from '../User/user.constant'

export interface IChatMessageItem {
  _id?: Types.ObjectId
  sender: Types.ObjectId
  senderRole: TAuthRole
  messageType: TChatMessageType
  text?: string | null
  images: string[]
  isRead: boolean
  readBy: Types.ObjectId[]
  readAt?: Date | null
  isEdited?: boolean
  editedAt?: Date | null
  isDeleted?: boolean
  deletedAt?: Date | null
  createdAt?: Date
  updatedAt?: Date
}

export interface IChatLastMessage {
  messageId?: Types.ObjectId | null
  sender: Types.ObjectId
  senderRole: TAuthRole
  messageType: TChatMessageType
  text?: string | null
  images: string[]
  sentAt: Date
}

export interface IChat {
  chatType: TChatType
  participants: Types.ObjectId[]
  customer?: Types.ObjectId | null
  artist?: Types.ObjectId | null
  supportUser?: Types.ObjectId | null
  supportUserRole?: TAuthRole | null
  assignedAdmin?: Types.ObjectId | null
  booking?: Types.ObjectId | null
  subject?: string | null
  messages: IChatMessageItem[]
  lastMessage?: IChatLastMessage | null
  lastMessageAt?: Date | null
  unreadByCustomer: number
  unreadByArtist: number
  unreadByAdmin: number
  unreadBySupportUser: number
  isActive: boolean
  createdAt?: Date
  updatedAt?: Date
}

export interface IChatDoc extends Document, IChat {}
