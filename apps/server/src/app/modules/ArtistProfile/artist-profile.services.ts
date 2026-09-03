import {
  ArtistProfile,
  artistProfileSearchableFields,
  AuthStatus,
  User,
  verificationStatus,
  type IUser,
} from '@repo/db'
import httpStatus from 'http-status'
import { AppError, getUserFromRequest } from '@repo/shared'
import type { PipelineStage } from 'mongoose'

import type {
  TCreateArtistProfilePayloadType,
  TUpdateArtistProfilePayloadType,
  TGetAllArtistProfileQueryParamsType,
} from './artist-profile.validations'
import {
  deleteMultipleFilesFromS3,
  deleteSingleFileFromS3,
  uploadMultipleFileToS3,
  uploadSingleFileToS3,
  type TMulterFile,
  type TMulterFileList,
} from 'packages/media-hub/src'
import { AWS_FOLDER_NAMES } from '@app/libs/files_folder'
import mongoose from 'mongoose'
import { isValidCoordinates } from '@app/libs'

interface IArtistProfileFile {
  drivingLicenseFrontSide: TMulterFileList
  drivingLicenseBackSide: TMulterFileList
  selfie: TMulterFileList
  profileImage: TMulterFileList
}

export const createArtistProfile = async (
  user: IUser,
  payload: TCreateArtistProfilePayloadType,
  files: IArtistProfileFile
) => {
  const {
    businessName,
    abn,
    phone,
    businessAddress,
    latitude,
    longitude,
    city,
    state,
    postalCode,
    professionalBio,
    yearOfExperience,
    instagram,
    facebook,
    language,
    website,
    travelRadius,
  } = payload

  if (user.isProfileCompleted) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Your professional profile is already completed.')
  }

  // 1. Validate mandatory files upfront before hitting DB or S3
  const drivingLicenseFrontSideFile = files?.drivingLicenseFrontSide?.[0]
  const drivingLicenseBackSideFile = files?.drivingLicenseBackSide?.[0]
  const selfieFile = files?.selfie?.[0]
  const profileImageFile = files?.profileImage?.[0]

  if (!drivingLicenseFrontSideFile) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Driving license front side is required.')
  }
  if (!drivingLicenseBackSideFile) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Driving license back side is required.')
  }
  if (!selfieFile) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Selfie is required.')
  }

  // 2. Parallelize pre-validation database queries
  const [existingArtist, hasAnyAssociatedWithThisAbn, hasAnyAssociatedWithThisPhone] =
    await Promise.all([
      ArtistProfile.findOne({ user: user?._id }),
      ArtistProfile.findOne({ user: { $ne: user?._id }, abn }),
      phone ? User.findOne({ _id: { $ne: user?._id }, phone }) : null,
    ])

  if (existingArtist) {
    throw new AppError(httpStatus.CONFLICT, 'Professional profile already exists.')
  }
  if (hasAnyAssociatedWithThisAbn) {
    throw new AppError(httpStatus.CONFLICT, 'The ABN number is already in use.')
  }
  if (hasAnyAssociatedWithThisPhone) {
    throw new AppError(httpStatus.CONFLICT, 'The phone number is already in use.')
  }

  // 3. Upload all files to S3 in parallel
  const newlyUploadedUrls: string[] = []
  let drivingLicenseFrontSideUrl = ''
  let drivingLicenseBackSideUrl = ''
  let selfieUrl = ''
  let newProfileImageUrl: string | undefined

  try {
    const uploadTasks: Promise<{ type: string; url: string }>[] = [
      uploadSingleFileToS3(drivingLicenseFrontSideFile, AWS_FOLDER_NAMES.Licenses).then((res) => ({
        type: 'dlFront',
        url: res.url,
      })),
      uploadSingleFileToS3(drivingLicenseBackSideFile, AWS_FOLDER_NAMES.Licenses).then((res) => ({
        type: 'dlBack',
        url: res.url,
      })),
      uploadSingleFileToS3(selfieFile, AWS_FOLDER_NAMES.Selfies).then((res) => ({
        type: 'selfie',
        url: res.url,
      })),
    ]

    if (profileImageFile) {
      uploadTasks.push(
        uploadSingleFileToS3(profileImageFile, AWS_FOLDER_NAMES.ProfileImage).then((res) => ({
          type: 'profileImage',
          url: res.url,
        }))
      )
    }

    const uploadResults = await Promise.all(uploadTasks)

    for (const item of uploadResults) {
      newlyUploadedUrls.push(item.url)
      if (item.type === 'dlFront') drivingLicenseFrontSideUrl = item.url
      if (item.type === 'dlBack') drivingLicenseBackSideUrl = item.url
      if (item.type === 'selfie') selfieUrl = item.url
      if (item.type === 'profileImage') newProfileImageUrl = item.url
    }
  } catch (error) {
    if (newlyUploadedUrls.length > 0) {
      await deleteMultipleFilesFromS3(newlyUploadedUrls).catch(() => {})
    }
    throw error
  }

  // 4. Execute atomic database transaction
  const mongoSession = await mongoose.startSession()

  try {
    mongoSession.startTransaction()

    const [professionalProfile] = await ArtistProfile.create(
      [
        {
          user: user?._id,
          businessName,
          abn,
          businessAddress,
          yearOfExperience,
          professionalBio: professionalBio!,

          // Verification uploads
          drivingLicenseFrontSide: drivingLicenseFrontSideUrl!,
          drivingLicenseBackSide: drivingLicenseBackSideUrl!,
          selfie: selfieUrl,

          // Location & Social
          location: {
            type: 'Point',
            coordinates: [longitude, latitude],
          },
          city,
          state,
          postalCode,
          website: website!,
          instagram: instagram!,
          facebook,
          language,
          travelRadius,
        },
      ],
      { session: mongoSession }
    )

    if (!professionalProfile) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Failed to create professional profile.')
    }

    const oldProfileImage = user.profileImage
    if (phone !== undefined) user.phone = phone
    if (newProfileImageUrl !== undefined) user.profileImage = newProfileImageUrl
    user.isProfileCompleted = true
    user.verificationStatus = verificationStatus.IN_REVIEW

    await user.save({ session: mongoSession })

    await mongoSession.commitTransaction()

    // 5. Cleanup replaced avatar on success (outside transaction)
    if (newProfileImageUrl && oldProfileImage) {
      await deleteMultipleFilesFromS3([oldProfileImage]).catch(() => {})
    }

    return professionalProfile
  } catch (error) {
    await mongoSession.abortTransaction()

    // Clean up only the files uploaded during this specific request
    if (newlyUploadedUrls.length > 0) {
      await deleteMultipleFilesFromS3(newlyUploadedUrls).catch(() => {})
    }

    throw error
  } finally {
    await mongoSession.endSession()
  }
}

const updateArtistProfile = async (
  user: IUser,
  payload: TUpdateArtistProfilePayloadType,
  profileImage?: TMulterFile
) => {
  const {
    name,
    professionalBio,
    businessAddress,
    latitude,
    longitude,
    phone,
    facebook,
    instagram,
    language,
    city,
    state,
    postalCode,
    travelRadius,
  } = payload

  const session = await mongoose.startSession()

  let newImageUrl: string | undefined
  const oldImageUrl = (user.profileImage as string) ?? ''

  try {
    // Start transaction
    session.startTransaction()

    // Find artist profile inside transaction
    const artistProfile = await ArtistProfile.findOne({
      user: user._id,
    }).session(session)

    if (!artistProfile) {
      throw new AppError(
        httpStatus.NOT_FOUND,
        "Artist profile doesn't exist. Please complete your profile first."
      )
    }

    if (!user?.isProfileCompleted) {
      throw new AppError(httpStatus.NOT_FOUND, 'Please complete your profile first.')
    }

    // --------------------------------------------------
    // Phone number
    // --------------------------------------------------

    const normalizedPhone = phone !== undefined ? phone.trim() : undefined

    const currentPhone = user.phone?.trim()

    const isPhoneNumberChanged = normalizedPhone !== undefined && normalizedPhone !== currentPhone

    if (isPhoneNumberChanged) {
      const existingUser = await User.findOne({
        _id: { $ne: user._id },
        phone: normalizedPhone,
      }).session(session)

      if (existingUser) {
        throw new AppError(httpStatus.CONFLICT, 'This phone number is already in use.')
      }

      user.phone = normalizedPhone
    }

    // --------------------------------------------------
    // Coordinates
    // --------------------------------------------------

    const currentLatitude = artistProfile.location?.coordinates?.[1]

    const currentLongitude = artistProfile.location?.coordinates?.[0]

    const updatedLatitude = latitude !== undefined ? Number(latitude) : currentLatitude

    const updatedLongitude = longitude !== undefined ? Number(longitude) : currentLongitude

    if (!Number.isFinite(updatedLatitude)) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Latitude must be a valid number.')
    }

    if (!Number.isFinite(updatedLongitude)) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Longitude must be a valid number.')
    }

    if (!isValidCoordinates(updatedLatitude, updatedLongitude)) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Provide valid latitude and longitude.')
    }

    // --------------------------------------------------
    // Travel radius
    // --------------------------------------------------

    if (travelRadius !== undefined) {
      const updatedTravelRadius = Number(travelRadius)

      if (!Number.isFinite(updatedTravelRadius) || updatedTravelRadius < 0) {
        throw new AppError(
          httpStatus.BAD_REQUEST,
          'Travel radius must be a valid non-negative number.'
        )
      }

      artistProfile.travelRadius = updatedTravelRadius
    }

    // --------------------------------------------------
    // Update location
    // GeoJSON format:
    // [longitude, latitude]
    // --------------------------------------------------

    artistProfile.location = {
      type: 'Point',
      coordinates: [updatedLongitude, updatedLatitude],
    }

    // --------------------------------------------------
    // Upload new profile image
    // --------------------------------------------------

    if (profileImage) {
      const { url } = await uploadSingleFileToS3(profileImage, AWS_FOLDER_NAMES.ProfileImage)

      newImageUrl = url

      user.profileImage = url
    }

    // --------------------------------------------------
    // Update User fields
    // --------------------------------------------------

    if (name !== undefined) {
      user.name = name
    }

    // --------------------------------------------------
    // Update Artist Profile fields
    // --------------------------------------------------

    if (professionalBio !== undefined) {
      artistProfile.professionalBio = professionalBio
    }

    if (businessAddress !== undefined) {
      artistProfile.businessAddress = businessAddress
    }

    if (facebook !== undefined) {
      artistProfile.facebook = facebook
    }

    if (instagram !== undefined) {
      artistProfile.instagram = instagram!
    }

    if (language !== undefined) {
      artistProfile.language = language
    }

    if (city !== undefined) {
      artistProfile.city = city
    }

    if (state !== undefined) {
      artistProfile.state = state
    }

    if (postalCode !== undefined) {
      artistProfile.postalCode = postalCode
    }

    // --------------------------------------------------
    // Save both documents
    // --------------------------------------------------

    await user.save({
      session,
      validateBeforeSave: true,
    })

    await artistProfile.save({
      session,
      validateBeforeSave: true,
    })

    // --------------------------------------------------
    // Commit transaction
    // --------------------------------------------------

    await session.commitTransaction()

    // --------------------------------------------------
    // Delete old image AFTER successful transaction
    // --------------------------------------------------

    if (newImageUrl && oldImageUrl && oldImageUrl !== newImageUrl) {
      deleteSingleFileFromS3(oldImageUrl).catch((error) => {
        console.error('Failed to delete old profile image:', error)
      })
    }

    return artistProfile
  } catch (error) {
    // --------------------------------------------------
    // Rollback MongoDB transaction
    // --------------------------------------------------

    if (session.inTransaction()) {
      await session.abortTransaction()
    }

    // --------------------------------------------------
    // Delete newly uploaded image because DB update failed
    // --------------------------------------------------

    if (newImageUrl) {
      deleteSingleFileFromS3(newImageUrl).catch((deleteError) => {
        console.error('Failed to delete newly uploaded profile image:', deleteError)
      })
    }

    throw error
  } finally {
    await session.endSession()
  }
}

// ?? Verify documents (Admin)
const verifyArtistDocuments = async (targetUserId: string) => {
  // ?? Check is user exists ? :
  const targetedUser = await User.findById(targetUserId)
  if (!targetedUser) {
    throw new AppError(httpStatus.NOT_FOUND, "User doesn't exists.")
  }

  // ?? Check is User Status active?:
  if (targetedUser.status !== AuthStatus.ACTIVE) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `Only active artist documents you can verify. Current Status: "${targetedUser.status}"`
    )
  }

  // ?? Check is user profile completed?:
  if (!targetedUser.isProfileCompleted) {
    throw new AppError(httpStatus.BAD_REQUEST, `Artist profile is incomplete.`)
  }

  // ?? Check Artist profile exists?:
  const artistProfile = await ArtistProfile.findOne({ user: targetedUser?._id })
  if (!artistProfile) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Artist professional profile does not exists.')
  }

  // ?? Check verification status: PENDING
  if (targetedUser.verificationStatus === verificationStatus.PENDING) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Document is not submitted yet.')
  }

  // ?? Check verification status: VERIFIED
  if (targetedUser.verificationStatus === verificationStatus.VERIFIED) {
    throw new AppError(httpStatus.BAD_REQUEST, 'The artist documents have already been verified.')
  }

  // ?? Check verification status: REJECTED:
  if (targetedUser.verificationStatus === verificationStatus.REJECTED) {
    throw new AppError(httpStatus.BAD_REQUEST, 'The artist documents have been rejected.')
  }

  targetedUser.verificationStatus = verificationStatus.VERIFIED
  await targetedUser.save()

  return {
    userId: targetedUser?._id,
    email: targetedUser?.email,
    isProfileCompleted: targetedUser?.isProfileCompleted,
    role: targetedUser?.role,
    status: targetedUser?.status,
    verificationStatus: targetedUser?.verificationStatus,
  }
}

// ?? Reject Documents (Admin)
const rejectArtistDocuments = async (targetUserId: string, reason: string) => {
  // ?? Check is user exists ? :
  const targetedUser = await User.findById(targetUserId)
  if (!targetedUser) {
    throw new AppError(httpStatus.NOT_FOUND, "User doesn't exists.")
  }

  // ?? Check is User Status active?:
  if (targetedUser.status !== AuthStatus.ACTIVE) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `Only active artist documents you can reject. Current Status: "${targetedUser.status}"`
    )
  }

  // ?? Check is user profile completed?:
  if (!targetedUser.isProfileCompleted) {
    throw new AppError(httpStatus.BAD_REQUEST, `Artist profile is incomplete.`)
  }

  // ?? Check Artist profile exists?:
  const artistProfile = await ArtistProfile.findOne({ user: targetedUser?._id })
  if (!artistProfile) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Artist professional profile does not exists.')
  }

  // ?? Check verification status: PENDING
  if (targetedUser.verificationStatus === verificationStatus.PENDING) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Document is not submitted yet.')
  }

  // ?? Check verification status: VERIFIED
  if (targetedUser.verificationStatus === verificationStatus.VERIFIED) {
    throw new AppError(httpStatus.BAD_REQUEST, 'The artist documents have already been verified.')
  }

  // ?? Check verification status: REJECTED:
  if (targetedUser.verificationStatus === verificationStatus.REJECTED) {
    throw new AppError(httpStatus.BAD_REQUEST, 'The artist documents have already been rejected.')
  }

  targetedUser.verificationStatus = verificationStatus.REJECTED
  targetedUser.rejectionReason = reason
  await targetedUser.save()

  return {
    userId: targetedUser?._id,
    email: targetedUser?.email,
    isProfileCompleted: targetedUser?.isProfileCompleted,
    role: targetedUser?.role,
    status: targetedUser?.status,
    verificationStatus: targetedUser?.verificationStatus,
  }
}

// ?? Resubmit Documents:
const resubmitDocuments = async (user: IUser, files: IArtistProfileFile) => {
  // 1. Validate user state
  if (!user.isProfileCompleted) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Please complete your professional profile first.')
  }

  if (user.verificationStatus !== verificationStatus.REJECTED) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'You can only resubmit documents after your previous submission was rejected.'
    )
  }

  // 2. Validate uploaded files presence
  const drivingLicenseFrontSideFile = files?.drivingLicenseFrontSide?.[0]
  const drivingLicenseBackSideFile = files?.drivingLicenseBackSide?.[0]
  const selfieFile = files?.selfie?.[0]

  if (!drivingLicenseFrontSideFile && !drivingLicenseBackSideFile && !selfieFile) {
    throw new AppError(httpStatus.BAD_REQUEST, 'At least one document is required.')
  }

  // 3. Early check: ensure artist profile exists before spending resources on S3 upload
  const existingProfile = await ArtistProfile.findOne({ user: user?._id })
  if (!existingProfile) {
    throw new AppError(httpStatus.BAD_REQUEST, "Artist profile doesn't exist.")
  }

  // 4. Upload files to S3 (track URLs immediately on success)
  const newlyUploadedUrls: string[] = []
  let newLicenseFrontSideUrl: string | undefined
  let newLicenseBackSideUrl: string | undefined
  let newSelfieUrl: string | undefined

  try {
    const uploadTasks: Promise<void>[] = []

    if (drivingLicenseFrontSideFile) {
      uploadTasks.push(
        uploadSingleFileToS3(drivingLicenseFrontSideFile, AWS_FOLDER_NAMES.Licenses).then((res) => {
          newlyUploadedUrls.push(res.url)
          newLicenseFrontSideUrl = res.url
        })
      )
    }

    if (drivingLicenseBackSideFile) {
      uploadTasks.push(
        uploadSingleFileToS3(drivingLicenseBackSideFile, AWS_FOLDER_NAMES.Licenses).then((res) => {
          newlyUploadedUrls.push(res.url)
          newLicenseBackSideUrl = res.url
        })
      )
    }

    if (selfieFile) {
      uploadTasks.push(
        uploadSingleFileToS3(selfieFile, AWS_FOLDER_NAMES.Selfies).then((res) => {
          newlyUploadedUrls.push(res.url)
          newSelfieUrl = res.url
        })
      )
    }

    await Promise.all(uploadTasks)
  } catch (error) {
    if (newlyUploadedUrls.length > 0) {
      deleteMultipleFilesFromS3(newlyUploadedUrls).catch((s3Err) => console.error(s3Err))
    }
    throw error
  }

  // 5. Database transaction
  const oldImagesUrls: string[] = []
  const mongoSession = await mongoose.startSession()

  try {
    mongoSession.startTransaction()

    const artistProfile = await ArtistProfile.findOne({ user: user._id }).session(mongoSession)
    if (!artistProfile) {
      throw new AppError(httpStatus.BAD_REQUEST, "Artist profile doesn't exist.")
    }

    if (newLicenseFrontSideUrl) {
      if (artistProfile.drivingLicenseFrontSide) {
        oldImagesUrls.push(artistProfile.drivingLicenseFrontSide)
      }
      artistProfile.drivingLicenseFrontSide = newLicenseFrontSideUrl
    }

    if (newLicenseBackSideUrl) {
      if (artistProfile.drivingLicenseBackSide) {
        oldImagesUrls.push(artistProfile.drivingLicenseBackSide)
      }
      artistProfile.drivingLicenseBackSide = newLicenseBackSideUrl
    }

    if (newSelfieUrl) {
      if (artistProfile.selfie) {
        oldImagesUrls.push(artistProfile.selfie)
      }
      artistProfile.selfie = newSelfieUrl
    }

    // Save profile changes
    await artistProfile.save({ session: mongoSession })

    // Update user status safely
    await User.findByIdAndUpdate(
      user._id,
      {
        $set: {
          verificationStatus: verificationStatus.IN_REVIEW,
          rejectionReason: null,
        },
      },
      { session: mongoSession }
    )

    await mongoSession.commitTransaction()

    // Clean up replaced files from S3 asynchronously
    if (oldImagesUrls.length > 0) {
      deleteMultipleFilesFromS3(oldImagesUrls).catch((err) => console.error(err))
    }

    return artistProfile
  } catch (err) {
    await mongoSession.abortTransaction()

    // Rollback S3 uploads if DB transaction fails
    if (newlyUploadedUrls.length > 0) {
      deleteMultipleFilesFromS3(newlyUploadedUrls).catch((s3Err) => console.error(s3Err))
    }

    throw err
  } finally {
    await mongoSession.endSession()
  }
}

// ?? Get your verification status :
const getVerificationStatus = async (user: IUser) => {
  // ?? Check is profile completed?:
  if (!user.isProfileCompleted) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Please complete your profile first.')
  }

  // ?? Check is artist profile exists:?
  const artistProfile = await ArtistProfile.findOne({
    user: user?._id,
  })

  if (!artistProfile) {
    throw new AppError(httpStatus.NOT_FOUND, 'Artist profiles does not exists.')
  }

  return {
    userId: user._id,
    artistProfile: artistProfile?._id,
    status: user.status,
    verificationStatus: user.verificationStatus,
    drivingLicenseFrontSide: artistProfile.drivingLicenseFrontSide ?? null,
    drivingLicenseBackSide: artistProfile.drivingLicenseBackSide ?? null,
    selfie: artistProfile.selfie ?? null,
    rejectionReason: user.rejectionReason,
  }
}

// ?? Add Portfolio image
const addPortFolio = async (user: IUser, portfolioImages: TMulterFileList) => {
  // 1. Check if artist profile exists
  const artistProfile = await ArtistProfile.findOne({
    user: user?._id,
  })

  if (!artistProfile) {
    throw new AppError(httpStatus.BAD_REQUEST, "Artist profile doesn't exist.")
  }

  // 2. Validate new files
  const newFilesLength = portfolioImages?.length ?? 0

  if (newFilesLength < 1) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Minimum one portfolio image is required.')
  }

  // 3. Get existing portfolio images
  const previousFiles = artistProfile.portfolioImages ?? []
  const previousFilesLength = previousFiles.length

  // 4. Check maximum limit
  const totalFilesLength = previousFilesLength + newFilesLength

  if (totalFilesLength > 10) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `You cannot upload more than 10 portfolio images. Already uploaded ${previousFilesLength} and newly added ${newFilesLength}.`
    )
  }

  // 5. Upload new files to S3
  const uploadedImages = await uploadMultipleFileToS3(
    portfolioImages,
    AWS_FOLDER_NAMES.PortfolioImage
  )

  // 6. Extract valid uploaded URLs
  const newlyUploadedUrls = uploadedImages
    ?.map((item) => item?.url)
    .filter((url): url is string => Boolean(url))

  // 7. Make sure all requested files were uploaded successfully
  if (newlyUploadedUrls.length !== newFilesLength) {
    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Some portfolio images failed to upload. Please try again.'
    )
  }

  // 8. Append new images to existing images
  artistProfile.portfolioImages = [...previousFiles, ...newlyUploadedUrls]

  // 9. Save profile
  await artistProfile.save()

  return artistProfile
}

// ?? Remove Portfolio images:
const removePortfolioImage = async (user: IUser, url: string) => {
  // ?? Check is artist profile exists ?:
  const artistProfile = await ArtistProfile.findOne({ user: user?._id })
  if (!artistProfile) {
    throw new AppError(httpStatus.BAD_REQUEST, "Artist profile doesn't exists.")
  }

  // ?? Has any portfolio images ?:
  const portfolioImageUrls = artistProfile?.portfolioImages ?? []
  if (portfolioImageUrls?.length < 1) {
    throw new AppError(httpStatus.BAD_REQUEST, 'No portfolio image exists.')
  }

  // ?? Filter out the url :
  const currentUrlExists = portfolioImageUrls.find(
    (portfolioUrl) => portfolioUrl?.trim() === url?.trim()
  )
  if (!currentUrlExists) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Given url not found.')
  }

  // ?? Other images:
  const otherImages = portfolioImageUrls.filter((img) => img?.trim() !== url?.trim())

  // ?? Attempt to delete the url:
  artistProfile.portfolioImages = otherImages

  await artistProfile.save()

  deleteSingleFileFromS3(currentUrlExists).catch((err) => console.log(err))

  return artistProfile
}

const getAllArtistProfile = async (query: TGetAllArtistProfileQueryParamsType) => {
  const {
    page = 1,
    limit = 10,
    searchTerm,
    sortOrder = 'desc',
    sortBy = 'createdAt',
    fromDate,
    toDate,
  } = query

  const skip = (page - 1) * limit
  const pipeline: PipelineStage[] = []

  if (fromDate || toDate) {
    const dateFilter: Record<string, unknown> = {}
    if (fromDate) dateFilter.$gte = new Date(fromDate)
    if (toDate) dateFilter.$lte = new Date(toDate)

    pipeline.push({ $match: { createdAt: dateFilter } })
  }

  if (searchTerm) {
    pipeline.push({
      $match: {
        $or: artistProfileSearchableFields.map((field) => ({
          [field]: { $regex: searchTerm, $options: 'i' },
        })),
      },
    })
  }

  pipeline.push({ $sort: { [sortBy]: sortOrder === 'asc' ? 1 : -1 } })

  pipeline.push({
    $facet: {
      data: [{ $skip: skip }, { $limit: limit }],
      meta: [{ $count: 'total' }],
    },
  })

  const aggregated = await ArtistProfile.aggregate(pipeline)

  const data = aggregated?.[0]?.data || []
  const total = aggregated?.[0]?.meta?.[0]?.total || 0

  return {
    data,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  }
}

export const artistProfileServices = {
  createArtistProfile,
  updateArtistProfile,
  getAllArtistProfile,

  // ?? Document Related Route:
  verifyArtistDocuments,
  rejectArtistDocuments,
  resubmitDocuments,
  getVerificationStatus,

  // ?? Portfolios:
  addPortFolio,
  removePortfolioImage,
}
