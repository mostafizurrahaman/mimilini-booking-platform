import { Document, Types } from 'mongoose'
import type { TReviewModerationStatus } from './review.constants'

export interface IReviewReportItem {
  reportedBy: Types.ObjectId
  reason: string
  isFakeReview?: boolean
  reportedAt: Date
}

export interface IReview {
  reviewNumber?: string
  customer: Types.ObjectId
  artist: Types.ObjectId
  booking?: Types.ObjectId | null
  service?: Types.ObjectId | null
  serviceName?: string | null
  location?: string | null
  rating: number // 1 to 5
  tags: string[]
  comment?: string
  beforeImage?: string | null
  afterImage?: string | null
  images: string[] // customer review photo gallery
  artistReply?: {
    comment: string
    repliedAt: Date
  } | null
  isVerifiedBooking?: boolean
  isFeaturedStory?: boolean
  moderationStatus?: TReviewModerationStatus
  isFakeFlagged?: boolean
  reports?: IReviewReportItem[]
  reportsCount?: number
  adminWarningCount?: number
  isActive?: boolean
  createdAt?: Date
  updatedAt?: Date
}

export interface IReviewDoc extends Document, IReview {}
