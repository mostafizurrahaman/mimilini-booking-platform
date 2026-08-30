import {
  ArtistProfile,
  artistProfileSearchableFields,
  User,
  verificationStatus,
  type IUser,
} from '@repo/db'
import httpStatus from 'http-status'
import { AppError } from '@repo/shared'
import type { PipelineStage } from 'mongoose'

import type {
  TCreateArtistProfilePayloadType,
  TUpdateArtistProfilePayloadType,
  TGetAllArtistProfileQueryParamsType,
} from './artist-profile.validations'
import {
  deleteMultipleFilesFromS3,
  uploadSingleFileToS3,
  type TMulterFile,
  type TMulterFileList,
} from 'packages/media-hub/src'
import { AWS_FOLDER_NAMES } from '@app/libs/files_folder'
import mongoose from 'mongoose'

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
    fullname,
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

  // ?? Check artist profile exists?:
  const artistProfile = await ArtistProfile.findOne({ user: user?._id })
  if (!artistProfile) {
    throw new AppError(httpStatus.NOT_FOUND, "Artist profile doesn't exists.")
  }

  let newImageUrl: string | undefined = null
  let oldImageUrl: string = ''

  if (profileImage) {
    const { url } = await uploadSingleFileToS3(profileImage, AWS_FOLDER_NAMES.ProfileImage)
    newImageUrl = url
  }

  if (newImageUrl && user.profileImage) oldImageUrl = user.profileImage

  // ?? Check Is number changed ?:
  const isPhoneNumberChanged = payload.phone !== undefined && phone?.trim() === user?.phone?.trim()

  if (isPhoneNumberChanged) {
    const hasAnyAssociatedUserWithThisPhone = await User.findOne({
      $ne: {
        user: user?._id,
      },
      phone: payload.phone,
    })

    if (hasAnyAssociatedUserWithThisPhone) {
      throw new AppError(httpStatus.CONFLICT, 'This phone number is already in use.')
    }

    user.phone = payload.phone
  }

  if (fullname !== undefined) user.name = fullname

  // ?? Now update for field of artist profile:
  if (professionalBio !== undefined) artistProfile.professionalBio = professionalBio
  if (businessAddress !== undefined) artistProfile.businessAddress = businessAddress
  if (facebook !== undefined) artistProfile.facebook = facebook
  if (instagram !== undefined) artistProfile.instagram = instagram as string
  if (language !== undefined) artistProfile.language = language
  if (city !== undefined) artistProfile.city = city
  if (state !== undefined) artistProfile.state = state
  if (postalCode !== undefined) artistProfile.postalCode = postalCode
  if (travelRadius !== undefined) artistProfile.travelRadius = travelRadius

  const updatedLatitude =
    latitude !== undefined ? latitude : artistProfile?.location?.coordinates?.[1]
  const updatedLongitude =
    longitude !== undefined ? longitude : artistProfile?.location?.coordinates?.[0]

  // ?? Mongo session :
  const mongoSession = await mongoose.startSession()

  try {
  } catch (err) {}

  const result = await ArtistProfile.findOneAndUpdate({ _id: id }, { $set: payload }, { new: true })

  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, 'ArtistProfile not found')
  }

  return result
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

const getArtistProfileById = async (id: string) => {
  const result = await ArtistProfile.findById(id)

  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, 'ArtistProfile not found')
  }

  return result
}

const deleteArtistProfileById = async (id: string) => {
  const result = await ArtistProfile.findOneAndDelete({ _id: id })

  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, 'ArtistProfile not found')
  }

  return result
}

export const artistProfileServices = {
  createArtistProfile,
  updateArtistProfile,
  getAllArtistProfile,
  getArtistProfileById,
  deleteArtistProfileById,
}
