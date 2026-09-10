import { catchAsync, sendResponse } from '@repo/shared'
import httpStatus from 'http-status'
import { artistBlockedDateServices } from './artist-blocked-date.services'

const createArtistBlockedDate = catchAsync(async (req, res) => {
  const result = await artistBlockedDateServices.createArtistBlockedDate(req.body)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.CREATED,
    message: 'The artist blocked date created successfully!',
    data: result,
  })
})

const updateArtistBlockedDate = catchAsync(async (req, res) => {
  const result = await artistBlockedDateServices.updateArtistBlockedDate(req.params.id as string, req.body)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'The artist blocked date updated successfully!',
    data: result,
  })
})

const getAllArtistBlockedDate = catchAsync(async (req, res) => {
  const result = await artistBlockedDateServices.getAllArtistBlockedDate(req.query)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'The artist blocked date retrieved successfully!',
    data: result.data,
    meta: result.meta,
  })
})

const getArtistBlockedDateById = catchAsync(async (req, res) => {
  const result = await artistBlockedDateServices.getArtistBlockedDateById(req.params.id as string)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'The artist blocked date retrieved successfully!',
    data: result,
  })
})

const deleteArtistBlockedDateById = catchAsync(async (req, res) => {
  const result = await artistBlockedDateServices.deleteArtistBlockedDateById(req.params.id as string)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'The artist blocked date deleted successfully!',
    data: result,
  })
})

export const artistBlockedDateControllers = {
  createArtistBlockedDate,
  updateArtistBlockedDate,
  getAllArtistBlockedDate,
  getArtistBlockedDateById,
  deleteArtistBlockedDateById
}