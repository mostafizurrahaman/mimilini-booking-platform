import { catchAsync, sendResponse } from '@repo/shared'
import httpStatus from 'http-status'
import { availabilityServices } from './availability.services'
import { getUserFromRequest } from '@app/libs'

const createAvailability = catchAsync(async (req, res) => {
  const user = await getUserFromRequest(req)
  const result = await availabilityServices.createAvailability(user, req.body)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.CREATED,
    message: 'The availability created successfully!',
    data: result,
  })
})

const updateAvailability = catchAsync(async (req, res) => {
  const result = await availabilityServices.updateAvailability(req.params.id as string, req.body)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'The availability updated successfully!',
    data: result,
  })
})

const getAllAvailability = catchAsync(async (req, res) => {
  const result = await availabilityServices.getAllAvailability(req.query)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'The availability retrieved successfully!',
    data: result.data,
    meta: result.meta,
  })
})

const getAvailabilityByUserId = catchAsync(async (req, res) => {
  const user = await getUserFromRequest(req)
  const result = await availabilityServices.getAvailabilityByUserId(user)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'The availability retrieved successfully!',
    data: result,
  })
})

const deleteAvailabilityById = catchAsync(async (req, res) => {
  const result = await availabilityServices.deleteAvailabilityById(req.params.id as string)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'The availability deleted successfully!',
    data: result,
  })
})

export const availabilityControllers = {
  createAvailability,
  updateAvailability,
  getAllAvailability,
  getAvailabilityByUserId,
  deleteAvailabilityById,
}
