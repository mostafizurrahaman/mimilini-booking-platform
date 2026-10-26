import express, { Router } from 'express'
import { auth } from '@app/middlewares/auth'
import { validateRequest } from '@app/middlewares'
import { AuthRoles } from '@repo/db'
import { multerFactory } from 'packages/media-hub/src'
import { bookingControllers } from './booking.controllers'
import { bookingValidations } from './booking.validations'

const router: Router = express.Router()

router.post(
  '/preview',
  auth(AuthRoles.CUSTOMER, AuthRoles.ARTIST, AuthRoles.ADMIN, AuthRoles.SUPER_ADMIN),
  validateRequest(bookingValidations.checkoutPreviewSchema),
  bookingControllers.checkoutPreview
)

// 1000$
// artist -> Min: 50%
// we booking 50% -> 10%
// we notify second -> 10%:
// Group ->
// booking pending payment -> pay  - 50%
// booking option 
router.post(
  '/',
  auth(AuthRoles.CUSTOMER),
  validateRequest(bookingValidations.createBookingSchema),
  bookingControllers.createBooking
)

router.get(
  '/artist-inbox-summary',
  auth(AuthRoles.ARTIST),
  bookingControllers.getArtistInboxSummary
)

router.get(
  '/my-bookings',
  auth(AuthRoles.CUSTOMER, AuthRoles.ARTIST, AuthRoles.ADMIN, AuthRoles.SUPER_ADMIN),
  validateRequest(bookingValidations.getMyBookingsQuerySchema),
  bookingControllers.getMyBookings
)

router.patch(
  '/:id/accept',
  auth(AuthRoles.ARTIST, AuthRoles.ADMIN, AuthRoles.SUPER_ADMIN),
  bookingControllers.acceptBooking
)

router.patch(
  '/:id/decline',
  auth(AuthRoles.ARTIST, AuthRoles.ADMIN, AuthRoles.SUPER_ADMIN),
  validateRequest(bookingValidations.declineBookingSchema),
  bookingControllers.declineBooking
)

router.post(
  '/:id/complete',
  auth(AuthRoles.ARTIST, AuthRoles.ADMIN, AuthRoles.SUPER_ADMIN),
  multerFactory({ category: 'image', maxSizeInMB: 10 }).array('proofPhotos', 6),
  validateRequest(bookingValidations.completeBookingSchema),
  bookingControllers.completeBooking
)

router.post(
  '/:id/sign',
  auth(AuthRoles.CUSTOMER, AuthRoles.ADMIN, AuthRoles.SUPER_ADMIN),
  validateRequest(bookingValidations.customerSignSchema),
  bookingControllers.customerSign
)

router.post(
  '/:id/reschedule-request',
  auth(AuthRoles.CUSTOMER, AuthRoles.ARTIST, AuthRoles.ADMIN, AuthRoles.SUPER_ADMIN),
  validateRequest(bookingValidations.rescheduleRequestSchema),
  bookingControllers.requestReschedule
)

router.post(
  '/:id/reschedule-respond',
  auth(AuthRoles.CUSTOMER, AuthRoles.ARTIST, AuthRoles.ADMIN, AuthRoles.SUPER_ADMIN),
  validateRequest(bookingValidations.rescheduleResponseSchema),
  bookingControllers.respondReschedule
)

router.post(
  '/:id/cancel',
  auth(AuthRoles.CUSTOMER, AuthRoles.ARTIST, AuthRoles.ADMIN, AuthRoles.SUPER_ADMIN),
  validateRequest(bookingValidations.cancelBookingSchema),
  bookingControllers.cancelBooking
)

router.post(
  '/:id/customer-cancel',
  auth(AuthRoles.CUSTOMER, AuthRoles.ADMIN, AuthRoles.SUPER_ADMIN),
  validateRequest(bookingValidations.cancelBookingSchema),
  bookingControllers.customerCancelBooking
)

router.post(
  '/:id/artist-cancel',
  auth(AuthRoles.ARTIST, AuthRoles.ADMIN, AuthRoles.SUPER_ADMIN),
  validateRequest(bookingValidations.cancelBookingSchema),
  bookingControllers.artistCancelBooking
)

router.post(
  '/:id/pay-balance',
  auth(AuthRoles.CUSTOMER),
  validateRequest(bookingValidations.payBalanceSchema),
  bookingControllers.payBalance
)

router.post(
  '/:id/confirm-payment',
  auth(AuthRoles.CUSTOMER),
  validateRequest(bookingValidations.confirmBookingPaymentSchema),
  bookingControllers.confirmBookingPayment
)

router.get(
  '/:id',
  auth(AuthRoles.CUSTOMER, AuthRoles.ARTIST, AuthRoles.ADMIN, AuthRoles.SUPER_ADMIN),
  bookingControllers.getBookingById
)

router.get(
  '/:id/invoice',
  auth(AuthRoles.CUSTOMER, AuthRoles.ARTIST, AuthRoles.ADMIN, AuthRoles.SUPER_ADMIN),
  bookingControllers.getBookingInvoice
)

router.get(
  '/:id/receipt',
  auth(AuthRoles.CUSTOMER, AuthRoles.ADMIN, AuthRoles.SUPER_ADMIN),
  bookingControllers.getBookingReceipt
)

router.post(
  '/:id/report-no-show',
  auth(AuthRoles.ARTIST),
  validateRequest(bookingValidations.reportCustomerNoShowSchema),
  bookingControllers.reportCustomerNoShow
)

router.post(
  '/:id/verify-no-show',
  auth(AuthRoles.ADMIN, AuthRoles.SUPER_ADMIN),
  validateRequest(bookingValidations.verifyCustomerNoShowSchema),
  bookingControllers.verifyCustomerNoShow
)

router.get(
  '/:id/artist-invoice',
  auth(AuthRoles.ARTIST, AuthRoles.ADMIN, AuthRoles.SUPER_ADMIN),
  bookingControllers.getArtistInvoice
)

export const bookingRoutes = router
