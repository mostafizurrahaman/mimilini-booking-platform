import { catchAsync, sendResponse } from '@repo/shared'
import httpStatus from 'http-status'
import { waitlistServices } from './waitlist.services'

const createWaitlist = catchAsync(async (req, res) => {
  const result = await waitlistServices.createWaitlist(req.body)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.CREATED,
    message: 'Waitlist entry registered successfully!',
    data: result,
  })
})

const getAllWaitlist = catchAsync(async (req, res) => {
  const result = await waitlistServices.getAllWaitlist(req.query)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Waitlist entries retrieved successfully!',
    data: result.data,
    meta: result.meta,
  })
})

export const waitlistControllers = {
  createWaitlist,
  getAllWaitlist,
}
