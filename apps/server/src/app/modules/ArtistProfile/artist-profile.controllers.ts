import { catchAsync, sendResponse } from '@repo/shared'
import httpStatus from 'http-status'
import { artistProfileServices } from './artist-profile.services'
import { getUserFromRequest } from '@app/libs/get-user-from-request'
import type { TMulterFile, TMulterFileList } from 'packages/media-hub/src'
import type { TUpdateArtistProfilePayloadType } from './artist-profile.validations'

interface IArtistProfileFile {
  drivingLicenseFrontSide: TMulterFileList
  drivingLicenseBackSide: TMulterFileList
  selfie: TMulterFileList
  profileImage: TMulterFileList
}

// 1. Create Artist Profile
const createArtistProfile = catchAsync(async (req, res) => {
  const user = await getUserFromRequest(req)

  const result = await artistProfileServices.createArtistProfile(
    user,
    req.body,
    req.files as unknown as IArtistProfileFile
  )

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.CREATED,
    message: 'The artist profile created successfully!',
    data: result,
  })
})

// 2. Update Artist Profile
const updateArtistProfile = catchAsync(async (req, res) => {
  const user = await getUserFromRequest(req)
  const payload = req.body as TUpdateArtistProfilePayloadType
  const profileImage = req.file as TMulterFile
  const result = await artistProfileServices.updateArtistProfile(user, payload, profileImage)

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

const findAvailableArtists = catchAsync(async (req, res) => {
  const result = await artistProfileServices.findAvailableArtists(req.query)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Available artists retrieved successfully!',
    data: result.data,
    meta: result.meta,
  })
})

const getArtistDetails = catchAsync(async (req, res) => {
  const { artistId } = req.params
  const result = await artistProfileServices.getArtistDetails(artistId as string, req.query, req.user?._id)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Artist profile details retrieved successfully!',
    data: result,
  })
})

// 3. Verify document:
const verifyDocument = catchAsync(async (req, res) => {
  const targetUserId = req.params.userId as string

  const result = await artistProfileServices.verifyArtistDocuments(targetUserId)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'The artist document verified successfully.',
    data: result,
  })
})

// 4. Reject document:
const rejectDocument = catchAsync(async (req, res) => {
  const targetUserId = req.params.userId as string
  const reason = req.body.reason as string

  const result = await artistProfileServices.rejectArtistDocuments(targetUserId, reason)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'The artist document is rejected successfully.',
    data: result,
  })
})

// 5. Resubmit Documents:
const resubmitDocuments = catchAsync(async (req, res) => {
  const user = await getUserFromRequest(req)
  const files = req.files as unknown as IArtistProfileFile
  const result = await artistProfileServices.resubmitDocuments(user, files)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'The documents resubmitted successfully.',
    data: result,
  })
})

// 6. Verification Status Check:
const checkVerificationStatus = catchAsync(async (req, res) => {
  const user = await getUserFromRequest(req)

  const result = await artistProfileServices.getVerificationStatus(user)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'The artist document verification status retrieved.',
    data: result,
  })
})

// 7. Add Portfolio Images:
const addNewPortfolioImage = catchAsync(async (req, res) => {
  const user = await getUserFromRequest(req)
  const files = req.files as TMulterFileList
  const result = await artistProfileServices.addPortFolio(user, files)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'The portfolio images uploaded successfully.',
    data: result,
  })
})

const removePortfolioImage = catchAsync(async (req, res) => {
  const user = await getUserFromRequest(req)
  const { url } = req.body
  const result = await artistProfileServices.removePortfolioImage(user, url)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Portfolio image removed successfully.',
    data: result,
  })
})

const addCertification = catchAsync(async (req, res) => {
  const user = await getUserFromRequest(req)
  const file = req.file as TMulterFile

  const result = await artistProfileServices.addCertification(user, file, req.body)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Certificate uploaded successfully.',
    data: result,
  })
})

const removeCertification = catchAsync(async (req, res) => {
  const user = await getUserFromRequest(req)
  const result = await artistProfileServices.removeCertification(user, req.body)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Certificate removed successfully.',
    data: result,
  })
})


// 10. Toggle Favorite Artist:
const toggleFavoriteArtist = catchAsync(async (req, res) => {
  const userId = req.user?._id
  const { artistId } = req.params
  const result = await artistProfileServices.toggleFavoriteArtist(userId, artistId as string)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: result.message,
    data: result,
  })
})

// 11. Get My Favorite Artists:
const getMyFavoriteArtists = catchAsync(async (req, res) => {
  const userId = req.user?._id
  const result = await artistProfileServices.getMyFavoriteArtists(userId, req.query)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Favorite artists retrieved successfully.',
    meta: result.meta,
    data: result.data,
  })
})

export const artistProfileControllers = {
  toggleFavoriteArtist,
  getMyFavoriteArtists,
  createArtistProfile,
  updateArtistProfile,
  getAllArtistProfile,
  findAvailableArtists,
  getArtistDetails,

  // Verify documents:
  verifyDocument,
  rejectDocument,
  resubmitDocuments,
  checkVerificationStatus,

  // Portfolio:
  addNewPortfolioImage,
  removePortfolioImage,

  // Certifications:
  addCertification,
  removeCertification,
}
