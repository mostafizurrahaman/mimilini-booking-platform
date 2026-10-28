import { Schema, model } from 'mongoose'
import type { IChatDoc, IChatLastMessage, IChatMessageItem } from './chat.interfaces'
import {
  CHAT_MESSAGE_TYPE,
  CHAT_MESSAGE_TYPE_VALUES,
  CHAT_TYPE,
  CHAT_TYPE_VALUES,
} from './chat.constants'
import { AuthRolesValues } from '../User/user.constant'

const chatMessageItemSchema = new Schema<IChatMessageItem>(
  {
    sender: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    senderRole: {
      type: String,
      enum: AuthRolesValues,
      required: true,
    },
    messageType: {
      type: String,
      enum: CHAT_MESSAGE_TYPE_VALUES,
      default: CHAT_MESSAGE_TYPE.TEXT,
    },
    text: {
      type: String,
      trim: true,
      default: null,
    },
    images: {
      type: [String],
      default: [],
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    readBy: {
      type: [Schema.Types.ObjectId],
      ref: 'User',
      default: [],
    },
    readAt: {
      type: Date,
      default: null,
    },
    isEdited: {
      type: Boolean,
      default: false,
    },
    editedAt: {
      type: Date,
      default: null,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
)

const chatLastMessageSchema = new Schema<IChatLastMessage>(
  {
    messageId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    sender: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    senderRole: {
      type: String,
      enum: AuthRolesValues,
      required: true,
    },
    messageType: {
      type: String,
      enum: CHAT_MESSAGE_TYPE_VALUES,
      default: CHAT_MESSAGE_TYPE.TEXT,
    },
    text: {
      type: String,
      default: null,
    },
    images: {
      type: [String],
      default: [],
    },
    sentAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
)

const chatSchema = new Schema<IChatDoc>(
  {
    chatType: {
      type: String,
      enum: CHAT_TYPE_VALUES,
      default: CHAT_TYPE.NORMAL,
      required: true,
      index: true,
    },
    participants: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
      },
    ],
    customer: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    artist: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    supportUser: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    supportUserRole: {
      type: String,
      enum: [...AuthRolesValues, null],
      default: null,
    },
    assignedAdmin: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    booking: {
      type: Schema.Types.ObjectId,
      ref: 'Booking',
      default: null,
      index: true,
    },
    subject: {
      type: String,
      trim: true,
      default: null,
    },
    messages: {
      type: [chatMessageItemSchema],
      default: [],
    },
    lastMessage: {
      type: chatLastMessageSchema,
      default: null,
    },
    lastMessageAt: {
      type: Date,
      default: null,
      index: true,
    },
    unreadByCustomer: {
      type: Number,
      default: 0,
      min: 0,
    },
    unreadByArtist: {
      type: Number,
      default: 0,
      min: 0,
    },
    unreadByAdmin: {
      type: Number,
      default: 0,
      min: 0,
    },
    unreadBySupportUser: {
      type: Number,
      default: 0,
      min: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
)

chatSchema.index({ chatType: 1, customer: 1, artist: 1 })
chatSchema.index({ chatType: 1, supportUser: 1 })
chatSchema.index({ participants: 1, lastMessageAt: -1 })

export const Chat = model<IChatDoc>('Chat', chatSchema)
