import { Schema, model } from 'mongoose'
import type { IBookingHistoryDoc } from './booking-history.interfaces'
import {
  BOOKING_HISTORY_ROLE,
  BOOKING_HISTORY_ROLE_VALUES,
} from './booking-history.constants'
import { BOOKING_STATUS_VALUES } from '../Booking/booking.constants'

const bookingHistorySchema = new Schema<IBookingHistoryDoc>(
  {
    booking: {
      type: Schema.Types.ObjectId,
      ref: 'Booking',
      required: true,
      index: true,
    },
    bookingNumber: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    status: {
      type: String,
      enum: BOOKING_STATUS_VALUES,
      required: true,
    },
    milestone: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    performedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    performedByRole: {
      type: String,
      enum: BOOKING_HISTORY_ROLE_VALUES,
      default: BOOKING_HISTORY_ROLE.SYSTEM,
    },
    note: {
      type: String,
      trim: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
)

bookingHistorySchema.index({ booking: 1, createdAt: 1 })
bookingHistorySchema.index({ bookingNumber: 1, createdAt: 1 })

export const BookingHistory = model<IBookingHistoryDoc>(
  'BookingHistory',
  bookingHistorySchema
)
