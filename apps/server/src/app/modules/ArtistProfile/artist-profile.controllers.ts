import { catchAsync, sendResponse } from '@repo/shared'
import httpStatus from 'http-status'
import { artistProfileServices } from './artist-profile.services'

const createArtistProfile = catchAsync(async (req, res) => {
  const result = await artistProfileServices.createArtistProfile(req.body)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.CREATED,
    message: 'The artist profile created successfully!',
    data: result,
  })
})

const updateArtistProfile = catchAsync(async (req, res) => {
  const result = await artistProfileServices.updateArtistProfile(req.params.id as string, req.body)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'The artist profile updated successfully!',
    data: result,
  })
})

const getAllArtistProfile = catchAsync(async (req, res) => {
  const result = await artistProfileServices.getAllArtistProfile(req.query)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'The artist profile retrieved successfully!',
    data: result.data,
    meta: result.meta,
  })
})

const getArtistProfileById = catchAsync(async (req, res) => {
  const result = await artistProfileServices.getArtistProfileById(req.params.id as string)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'The artist profile retrieved successfully!',
    data: result,
  })
})

const deleteArtistProfileById = catchAsync(async (req, res) => {
  const result = await artistProfileServices.deleteArtistProfileById(req.params.id as string)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'The artist profile deleted successfully!',
    data: result,
  })
})

export const artistProfileControllers = {
  createArtistProfile,
  updateArtistProfile,
  getAllArtistProfile,
  getArtistProfileById,
  deleteArtistProfileById
}