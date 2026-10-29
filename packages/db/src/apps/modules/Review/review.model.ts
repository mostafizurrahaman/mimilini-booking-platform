import { Schema, model } from 'mongoose'
import type { IReviewDoc, IReviewReportItem } from './review.interfaces'
import {
  MIN_RATING,
  MAX_RATING,
  REVIEW_MODERATION_STATUS,
  REVIEW_MODERATION_STATUS_VALUES,
} from './review.constants'

const reviewReportItemSchema = new Schema<IReviewReportItem>(
  {
    reportedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    reason: {
      type: String,
      trim: true,
      required: true,
    },
    isFakeReview: {
      type: Boolean,
      default: false,
    },
    reportedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
)

const reviewSchema = new Schema<IReviewDoc>(
  {
    reviewNumber: {
      type: String,
      trim: true,
      index: true,
    },
    customer: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    artist: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    booking: {
      type: Schema.Types.ObjectId,
      ref: 'Booking',
      default: null,
    },
    service: {
      type: Schema.Types.ObjectId,
      ref: 'ArtistServices',
      default: null,
    },
    serviceName: {
      type: String,
      trim: true,
      default: null,
    },
    location: {
      type: String,
      trim: true,
      default: null,
    },
    rating: {
      type: Number,
      required: true,
      min: MIN_RATING,
      max: MAX_RATING,
      index: true,
    },
    tags: {
      type: [String],
      default: [],
    },
    comment: {
      type: String,
      trim: true,
      default: '',
    },
    beforeImage: {
      type: String,
      default: null,
    },
    afterImage: {
      type: String,
      default: null,
    },
    images: {
      type: [String],
      default: [],
    },
    artistReply: {
      comment: {
        type: String,
        trim: true,
      },
      repliedAt: {
        type: Date,
      },
    },
    isVerifiedBooking: {
      type: Boolean,
      default: true,
    },
    isFeaturedStory: {
      type: Boolean,
      default: false,
      index: true,
    },
    moderationStatus: {
      type: String,
      enum: REVIEW_MODERATION_STATUS_VALUES,
      default: REVIEW_MODERATION_STATUS.APPROVED,
      index: true,
    },
    isFakeFlagged: {
      type: Boolean,
      default: false,
      index: true,
    },
    reports: {
      type: [reviewReportItemSchema],
      default: [],
    },
    reportsCount: {
      type: Number,
      default: 0,
      index: true,
    },
    adminWarningCount: {
      type: Number,
      default: 0,
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

reviewSchema.index({ artist: 1, createdAt: -1 })
reviewSchema.index({ artist: 1, rating: -1 })
reviewSchema.index({ customer: 1, createdAt: -1 })
reviewSchema.index({ isActive: 1, isFeaturedStory: -1, rating: -1, createdAt: -1 })

// Enforce: Only one review allowed per booking from a customer
reviewSchema.index(
  { booking: 1 },
  {
    unique: true,
    sparse: true,
  }
)
reviewSchema.index(
  { customer: 1, booking: 1 },
  {
    unique: true,
    sparse: true,
  }
)

export const Review = model<IReviewDoc>('Review', reviewSchema)
