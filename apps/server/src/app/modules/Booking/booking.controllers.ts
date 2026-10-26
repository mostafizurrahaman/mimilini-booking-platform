import { catchAsync, sendResponse } from '@repo/shared'
import httpStatus from 'http-status'
import { getUserFromRequest } from '@app/libs'
import { bookingServices } from './booking.services'

const checkoutPreview = catchAsync(async (req, res) => {
  const user = await getUserFromRequest(req)
  const result = await bookingServices.checkoutPreview(user, req.body)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Checkout financial breakdown preview calculated successfully!',
    data: result,
  })
})

const createBooking = catchAsync(async (req, res) => {
  const user = await getUserFromRequest(req)
  const result = await bookingServices.createBooking(user, req.body)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.CREATED,
    message: 'Booking created and initial 20% payment processed successfully!',
    data: result,
  })
})

const cancelBooking = catchAsync(async (req, res) => {
  const user = await getUserFromRequest(req)
  const result = await bookingServices.cancelBooking(
    user,
    req.params.id as string,
    req.body.reason
  )

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: result.message,
    data: result.booking,
  })
})

const customerCancelBooking = catchAsync(async (req, res) => {
  const user = await getUserFromRequest(req)
  const result = await bookingServices.customerCancelBooking(
    user,
    req.params.id as string,
    req.body.reason
  )

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: result.message,
    data: result.booking,
  })
})

const artistCancelBooking = catchAsync(async (req, res) => {
  const user = await getUserFromRequest(req)
  const result = await bookingServices.artistCancelBooking(
    user,
    req.params.id as string,
    req.body.reason
  )

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: result.message,
    data: result.booking,
  })
})

const getMyBookings = catchAsync(async (req, res) => {
  const user = await getUserFromRequest(req)
  const result = await bookingServices.getMyBookings(user, req.query)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Bookings retrieved successfully!',
    data: result.bookings,
    meta: result.meta,
  })
})

const getBookingById = catchAsync(async (req, res) => {
  const user = await getUserFromRequest(req)
  const result = await bookingServices.getBookingById(
    user,
    req.params.id as string
  )

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Booking details retrieved successfully!',
    data: result,
  })
})

const getBookingInvoice = catchAsync(async (req, res) => {
  const user = await getUserFromRequest(req)
  const result = await bookingServices.getBookingInvoice(
    user,
    req.params.id as string
  )

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Booking tax invoice retrieved successfully!',
    data: result,
  })
})

const getBookingReceipt = catchAsync(async (req, res) => {
  const user = await getUserFromRequest(req)
  const result = await bookingServices.getBookingReceipt(
    user,
    req.params.id as string
  )

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Booking 80% balance payment receipt retrieved successfully!',
    data: result,
  })
})

const getArtistInvoice = catchAsync(async (req, res) => {
  const user = await getUserFromRequest(req)
  const result = await bookingServices.getArtistInvoice(
    user,
    req.params.id as string
  )

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Artist Recipient Created Tax Invoice (RCTI) retrieved successfully!',
    data: result,
  })
})

const payBalance = catchAsync(async (req, res) => {
  const user = await getUserFromRequest(req)
  const result = await bookingServices.payBalance(
    user,
    req.params.id as string,
    req.body.paymentMethodId
  )

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: result.message,
    data: result.booking,
  })
})

const acceptBooking = catchAsync(async (req, res) => {
  const user = await getUserFromRequest(req)
  const result = await bookingServices.acceptBooking(user, req.params.id as string)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Booking accepted successfully!',
    data: result,
  })
})

const confirmBookingPayment = catchAsync(async (req, res) => {
  const user = await getUserFromRequest(req)
  const result = await bookingServices.confirmBookingPayment(
    user,
    req.params.id as string,
    req.body
  )

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Booking confirmed and deposit paid successfully!',
    data: result,
  })
})

const declineBooking = catchAsync(async (req, res) => {
  const user = await getUserFromRequest(req)
  const result = await bookingServices.declineBooking(
    user,
    req.params.id as string,
    req.body?.reason
  )

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Booking declined successfully!',
    data: result,
  })
})

const completeBooking = catchAsync(async (req, res) => {
  const user = await getUserFromRequest(req)
  const files = (req.files as Express.Multer.File[]) || []
  const result = await bookingServices.completeBooking(
    user,
    req.params.id as string,
    req.body,
    files
  )

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Booking completed successfully!',
    data: result,
  })
})

const customerSign = catchAsync(async (req, res) => {
  const user = await getUserFromRequest(req)
  const result = await bookingServices.customerSign(
    user,
    req.params.id as string,
    req.body
  )

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Customer signature submitted successfully!',
    data: result,
  })
})

const requestReschedule = catchAsync(async (req, res) => {
  const user = await getUserFromRequest(req)
  const result = await bookingServices.requestReschedule(
    user,
    req.params.id as string,
    req.body
  )

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Reschedule request submitted successfully!',
    data: result,
  })
})

const respondReschedule = catchAsync(async (req, res) => {
  const user = await getUserFromRequest(req)
  const result = await bookingServices.respondReschedule(
    user,
    req.params.id as string,
    req.body
  )

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message:
      req.body.action === 'accept'
        ? 'Reschedule request accepted and booking updated!'
        : 'Reschedule request declined.',
    data: result,
  })
})

const getArtistInboxSummary = catchAsync(async (req, res) => {
  const user = await getUserFromRequest(req)
  const result = await bookingServices.getArtistInboxSummary(user)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Artist inbox summary retrieved successfully!',
    data: result,
  })
})

const reportCustomerNoShow = catchAsync(async (req, res) => {
  const user = await getUserFromRequest(req)
  const result = await bookingServices.reportCustomerNoShow(
    user,
    req.params.id as string,
    req.body
  )

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: result.message,
    data: result.booking,
  })
})

const verifyCustomerNoShow = catchAsync(async (req, res) => {
  const user = await getUserFromRequest(req)
  const result = await bookingServices.verifyCustomerNoShow(
    user,
    req.params.id as string,
    req.body
  )

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: result.message,
    data: result.booking,
  })
})

export const bookingControllers = {
  checkoutPreview,
  createBooking,
  cancelBooking,
  customerCancelBooking,
  artistCancelBooking,
  getMyBookings,
  getBookingById,
  getBookingInvoice,
  getBookingReceipt,
  getArtistInvoice,
  payBalance,
  acceptBooking,
  confirmBookingPayment,
  declineBooking,
  completeBooking,
  customerSign,
  requestReschedule,
  respondReschedule,
  getArtistInboxSummary,
  reportCustomerNoShow,
  verifyCustomerNoShow,
}
