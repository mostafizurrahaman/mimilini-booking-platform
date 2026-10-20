import { Document, Types } from 'mongoose'

export interface IReview {
  customer: Types.ObjectId
  artist: Types.ObjectId
  booking?: Types.ObjectId
  service?: Types.ObjectId
  rating: number // 1 to 5
  comment?: string
  images?: string[] // customer review photo gallery
  artistReply?: {
    comment: string
    repliedAt: Date
  }
  isVerifiedBooking?: boolean
  isActive?: boolean
  createdAt?: Date
  updatedAt?: Date
}

export interface IReviewDoc extends Document, IReview {}
