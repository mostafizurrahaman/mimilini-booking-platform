import express, { Router } from 'express'
import { auth } from '@app/middlewares/auth'
import { validateRequest } from '@app/middlewares'
import { AuthRoles } from '@repo/db'
import { multerFactory } from 'packages/media-hub/src'
import { reviewControllers } from './review.controllers'
import { reviewValidations } from './review.validations'

const router: Router = express.Router()

const reviewImagesUpload = multerFactory({
  category: 'image',
  maxSizeInMB: 10,
}).fields([
  { name: 'beforeImage', maxCount: 1 },
  { name: 'afterImage', maxCount: 1 },
  { name: 'images', maxCount: 6 },
])

// 1. Public: Customer Stories list (Home page & Customer Stories page - Figma customer/2.png & 11.png)
router.get(
  '/customer-stories',
  validateRequest(reviewValidations.getCustomerStoriesQuerySchema),
  reviewControllers.getCustomerStories
)

// 2. Public: Single Customer Story details + Related Stories (Figma customer/10.png)
router.get('/customer-stories/:id', reviewControllers.getCustomerStoryById)

// 3. Public: Get all reviews & rating breakdown for a specific Artist (Figma customer/15.png)
router.get('/artist/:artistId', reviewControllers.getArtistReviews)

// 4. Separate API for uploading review images (beforeImage, afterImage, images)
router.post(
  '/upload-images',
  auth(AuthRoles.CUSTOMER, AuthRoles.ADMIN, AuthRoles.SUPER_ADMIN),
  reviewImagesUpload,
  reviewControllers.uploadReviewImages
)

// 5. Submit a Review for a completed booking (Figma customer/23.png)
router.post(
  '/',
  auth(AuthRoles.CUSTOMER),
  reviewImagesUpload,
  validateRequest(reviewValidations.createReviewSchema),
  reviewControllers.createReview
)

// 6. Get logged-in user's reviews (Customer written / Artist received)
router.get(
  '/my-reviews',
  auth(AuthRoles.CUSTOMER, AuthRoles.ARTIST, AuthRoles.ADMIN, AuthRoles.SUPER_ADMIN),
  reviewControllers.getMyReviews
)

// 7. Get review & screen info for a specific booking (Figma customer/23.png & Artist/19.png "View Review")
router.get(
  '/booking/:bookingId',
  auth(AuthRoles.CUSTOMER, AuthRoles.ARTIST, AuthRoles.ADMIN, AuthRoles.SUPER_ADMIN),
  reviewControllers.getReviewByBooking
)

// 8. Admin: Review Moderation Dashboard & List (Figma Admin/11.png)
router.get(
  '/admin/moderation',
  auth(AuthRoles.ADMIN, AuthRoles.SUPER_ADMIN),
  validateRequest(reviewValidations.getAdminModerationQuerySchema),
  reviewControllers.getAdminReviewModeration
)

// 9. Admin: Perform Moderation Action (approve, hide, remove, warn_user, suspend_reviewer, feature_story, unfeature_story)
router.patch(
  '/admin/:id/action',
  auth(AuthRoles.ADMIN, AuthRoles.SUPER_ADMIN),
  validateRequest(reviewValidations.adminModerationActionSchema),
  reviewControllers.performAdminReviewAction
)

// 10. Artist: Reply to a review
router.patch(
  '/:id/reply',
  auth(AuthRoles.ARTIST),
  validateRequest(reviewValidations.replyReviewSchema),
  reviewControllers.replyToReview
)

// 11. Report a Fake or Inappropriate Review (Figma customer/23.png & Admin/11.png)
router.post(
  '/:id/report',
  auth(AuthRoles.CUSTOMER, AuthRoles.ARTIST, AuthRoles.ADMIN, AuthRoles.SUPER_ADMIN),
  validateRequest(reviewValidations.reportReviewSchema),
  reviewControllers.reportReview
)

// 12. Public: Single Review / Story Detail by ID
router.get('/:id', reviewControllers.getCustomerStoryById)

export const reviewRoutes = router

