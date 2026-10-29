import { catchAsync, sendResponse } from '@repo/shared'
import httpStatus from 'http-status'
import { availabilityServices } from './availability.services'
import { getUserFromRequest } from '@app/libs'
import { ArtistServices } from '@repo/db'

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
  const user = await getUserFromRequest(req)
  const result = await availabilityServices.updateAvailability(user, req.body)

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

const getArtistAvailableDaysInMonth = catchAsync(async (req, res) => {
  const { artistId } = req.params
  const { month } = req.query
  const result = await availabilityServices.getArtistAvailableDaysInMonth(
    artistId as string,
    month as string | undefined
  )

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Artist calendar availability days retrieved successfully!',
    data: result,
  })
})

const getArtistAvailableSlotsForDate = catchAsync(async (req, res) => {
  const { artistId } = req.params
  const { date, serviceId } = req.query

  let durationMinutes = 60
  if (serviceId) {
    const serviceDoc = await ArtistServices.findById(serviceId as string).lean()
    if (serviceDoc?.durationMinutes) {
      durationMinutes = serviceDoc.durationMinutes
    }
  }

  const result = await availabilityServices.getArtistAvailableSlotsForDate(
    artistId as string,
    date as string | undefined,
    durationMinutes
  )

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Artist available slots retrieved successfully!',
    data: result,
  })
})

const getMyCalendar = catchAsync(async (req, res) => {
  const user = await getUserFromRequest(req)
  const { month } = req.query
  const result = await availabilityServices.getArtistAvailableDaysInMonth(
    user._id.toString(),
    month as string | undefined
  )

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'My calendar availability retrieved successfully!',
    data: result,
  })
})

export const availabilityControllers = {
  createAvailability,
  updateAvailability,
  getAllAvailability,
  getAvailabilityByUserId,
  deleteAvailabilityById,
  getMyCalendar,
  getArtistAvailableDaysInMonth,
  getArtistAvailableSlotsForDate,
}
