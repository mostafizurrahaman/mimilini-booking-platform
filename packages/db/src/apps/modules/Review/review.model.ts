import { Schema, model } from 'mongoose'
import type { IReviewDoc } from './review.interfaces'
import { MIN_RATING, MAX_RATING } from './review.constants'

const reviewSchema = new Schema<IReviewDoc>(
  {
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
    },
    service: {
      type: Schema.Types.ObjectId,
      ref: 'ArtistServices',
    },
    rating: {
      type: Number,
      required: true,
      min: MIN_RATING,
      max: MAX_RATING,
      index: true,
    },
    comment: {
      type: String,
      trim: true,
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
