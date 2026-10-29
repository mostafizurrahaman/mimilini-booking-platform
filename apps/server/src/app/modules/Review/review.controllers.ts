import { AppError, catchAsync, sendResponse } from '@repo/shared'
import { User, type IUser, type TAdminReviewAction } from '@repo/db'
import httpStatus from 'http-status'
import type { Request } from 'express'
import { reviewServices } from './review.services'

const getUserFromRequest = async (req: Request): Promise<IUser> => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const decoded = (req as any).user
  const user = await User.isUserExistByEmail(decoded.email)
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found')
  }
  return user
}

/**
 * POST /api/v1/reviews/upload-images
 * Separate API to upload beforeImage, afterImage, and gallery images to S3
 */
const uploadReviewImages = catchAsync(async (req, res) => {
  const files = req.files as
    | Express.Multer.File[]
    | {
        beforeImage?: Express.Multer.File[]
        afterImage?: Express.Multer.File[]
        images?: Express.Multer.File[]
      }
    | undefined

  const result = await reviewServices.uploadReviewImages(files)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Review images uploaded successfully!',
    data: result,
  })
})

/**
 * POST /api/v1/reviews
 * Submit a review for a completed booking (Figma customer/23.png)
 */
const createReview = catchAsync(async (req, res) => {
  const user = await getUserFromRequest(req)
  const files = req.files as
    | {
        beforeImage?: Express.Multer.File[]
        afterImage?: Express.Multer.File[]
        images?: Express.Multer.File[]
      }
    | undefined

  const result = await reviewServices.createReview(user, req.body, files)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.CREATED,
    message: 'Review submitted successfully!',
    data: result,
  })
})

/**
 * GET /api/v1/reviews/customer-stories
 * Public list of Customer Stories (Figma customer/2.png & customer/11.png)
 */
const getCustomerStories = catchAsync(async (req, res) => {
  const result = await reviewServices.getCustomerStories(
    req.query as Record<string, string>
  )

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Customer stories retrieved successfully!',
    data: result.stories,
    meta: result.meta,
  })
})

/**
 * GET /api/v1/reviews/customer-stories/:id
 * Public single Customer Story Detail + Related Stories (Figma customer/10.png)
 */
const getCustomerStoryById = catchAsync(async (req, res) => {
  const result = await reviewServices.getCustomerStoryById(req.params.id as string)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Customer story details retrieved successfully!',
    data: result,
  })
})

/**
 * GET /api/v1/reviews/artist/:artistId
 * Public list of reviews for a specific Artist (Figma customer/15.png)
 */
const getArtistReviews = catchAsync(async (req, res) => {
  const result = await reviewServices.getArtistReviews(
    req.params.artistId as string,
    req.query as Record<string, string>
  )

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Artist reviews retrieved successfully!',
    data: {
      summary: result.summary,
      reviews: result.reviews,
    },
    meta: result.meta,
  })
})

/**
 * GET /api/v1/reviews/booking/:bookingId
 * Get review & booking info for Review Submission screen or Artist "View Review" button
 */
const getReviewByBooking = catchAsync(async (req, res) => {
  const user = await getUserFromRequest(req)
  const result = await reviewServices.getReviewByBooking(
    user,
    req.params.bookingId as string
  )

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Booking review details retrieved successfully!',
    data: result,
  })
})

/**
 * GET /api/v1/reviews/my-reviews
 * Get logged-in Customer's written reviews or Artist's received reviews
 */
const getMyReviews = catchAsync(async (req, res) => {
  const user = await getUserFromRequest(req)
  const result = await reviewServices.getMyReviews(
    user,
    req.query as Record<string, string>
  )

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Reviews retrieved successfully!',
    data: result.reviews,
    meta: result.meta,
  })
})

/**
 * PATCH /api/v1/reviews/:id/reply
 * Artist replies to a customer review
 */
const replyToReview = catchAsync(async (req, res) => {
  const user = await getUserFromRequest(req)
  const result = await reviewServices.replyToReview(
    user,
    req.params.id as string,
    req.body.comment
  )

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Reply added to review successfully!',
    data: result,
  })
})

/**
 * POST /api/v1/reviews/:id/report
 * Report a fake or inappropriate review (Figma customer/23.png & Admin/11.png)
 */
const reportReview = catchAsync(async (req, res) => {
  const user = await getUserFromRequest(req)
  const result = await reviewServices.reportReview(
    user,
    req.params.id as string,
    req.body
  )

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Review reported to moderation team successfully!',
    data: result,
  })
})

/**
 * GET /api/v1/reviews/admin/moderation
 * Admin Review Moderation Dashboard (Figma Admin/11.png)
 */
const getAdminReviewModeration = catchAsync(async (req, res) => {
  const result = await reviewServices.getAdminReviewModeration(
    req.query as Record<string, string>
  )

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Review moderation data retrieved successfully!',
    data: {
      stats: result.stats,
      reviews: result.reviews,
    },
    meta: result.meta,
  })
})

/**
 * PATCH /api/v1/reviews/admin/:id/action
 * Admin Review Moderation Action (Approve, Hide, Remove, Warn User, Suspend Reviewer, Feature Story)
 */
const performAdminReviewAction = catchAsync(async (req, res) => {
  const result = await reviewServices.performAdminReviewAction(
    req.params.id as string,
    req.body.action as TAdminReviewAction,
    req.body.note
  )

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: result.message,
    data: result.review,
  })
})

export const reviewControllers = {
  uploadReviewImages,
  createReview,
  getCustomerStories,
  getCustomerStoryById,
  getArtistReviews,
  getReviewByBooking,
  getMyReviews,
  replyToReview,
  reportReview,
  getAdminReviewModeration,
  performAdminReviewAction,
}

