import { catchAsync, sendResponse } from '@repo/shared'
import httpStatus from 'http-status'
import { artistServicesServices } from './artist-services.services'
import { getUserFromRequest } from '@app/libs'

const createArtistServices = catchAsync(async (req, res) => {
  const user = await getUserFromRequest(req)
  const result = await artistServicesServices.createArtistServices(user, req.body)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.CREATED,
    message: 'The artist services created successfully!',
    data: result,
  })
})

const updateArtistServices = catchAsync(async (req, res) => {
  const user = await getUserFromRequest(req)
  const result = await artistServicesServices.updateArtistServices(
    user,
    req.params.id as string,
    req.body
  )

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'The artist services updated successfully!',
    data: result,
  })
})

const toggleFeatured = catchAsync(async (req, res) => {
  const user = await getUserFromRequest(req)
  const result = await artistServicesServices.toggleFeatured(user, req.params.id as string)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: result?.message,
    data: null,
  })
})

const togglePopular = catchAsync(async (req, res) => {
  const user = await getUserFromRequest(req)
  const result = await artistServicesServices.togglePopular(user, req.params.id as string)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: result?.message,
    data: null,
  })
})

const getAllArtistServices = catchAsync(async (req, res) => {
  const result = await artistServicesServices.getAllArtistServices(req.query)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'The artist services retrieved successfully!',
    data: result.data,
    meta: result.meta,
  })
})
const getAllActiveArtistServices = catchAsync(async (req, res) => {
  const result = await artistServicesServices.getAllActiveArtistServices(req.query)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'All active artists are services retrieved successfully!',
    data: result.data,
    meta: result.meta,
  })
})

const getMyArtistServices = catchAsync(async (req, res) => {
  const user = await getUserFromRequest(req)
  const result = await artistServicesServices.getMyArtistServices(user, req.query)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Your services are retrieved successfully!',
    data: result.data,
    meta: result.meta,
  })
})

const getArtistServicesById = catchAsync(async (req, res) => {
  const result = await artistServicesServices.getArtistServicesById(req.params.id as string)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'The artist services retrieved successfully!',
    data: result,
  })
})

const deleteArtistServicesById = catchAsync(async (req, res) => {
  const result = await artistServicesServices.deleteArtistServicesById(req.params.id as string)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'The artist services deleted successfully!',
    data: result,
  })
})

export const artistServicesControllers = {
  createArtistServices,
  updateArtistServices,
  getAllArtistServices,
  getAllActiveArtistServices,
  getMyArtistServices,
  getArtistServicesById,
  deleteArtistServicesById,
  toggleFeatured,
  togglePopular,
}
