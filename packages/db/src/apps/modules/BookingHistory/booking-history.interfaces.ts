import { Document, Types } from 'mongoose'
import type { TBookingStatus } from '../Booking/booking.constants'
import type {
  TBookingHistoryRole,
  TBookingTimelineMilestone,
} from './booking-history.constants'

export interface IBookingHistory {
  booking: Types.ObjectId
  bookingNumber: string
  status: TBookingStatus
  milestone: TBookingTimelineMilestone | string
  title: string
  description?: string | null | undefined
  performedBy?: Types.ObjectId | null | undefined
  performedByRole?: TBookingHistoryRole
  note?: string | null | undefined
  metadata?: Record<string, any> | null | undefined
  createdAt?: Date
  updatedAt?: Date
}

export interface IBookingHistoryDoc extends Document, IBookingHistory {}
