import { ArtistProfile, artistProfileSearchableFields, User, type IUser } from '@repo/db'
import httpStatus from 'http-status'
import { AppError } from '@repo/shared'
import type { PipelineStage } from 'mongoose'

import type {
  TCreateArtistProfilePayloadType,
  TUpdateArtistProfilePayloadType,
  TGetAllArtistProfileQueryParamsType,
} from './artist-profile.validations'
import { uploadSingleFileToS3, type TMulterFileList } from 'packages/media-hub/src'
import { AWS_FOLDER_NAMES } from '@app/libs/files_folder'
import mongoose from 'mongoose'

interface IArtistProfileFile {
  drivingLicenseFrontSide: TMulterFileList
  drivingLicenseBackSide: TMulterFileList
  selfie: TMulterFileList
  profileImage: TMulterFileList
}

const createArtistProfile = async (
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

  // ?? Check is artist profile already exists ?:
  const existingArtist = await ArtistProfile.findOne({
    user: user?._id,
  })

  if (existingArtist) {
    throw new AppError(httpStatus.CONFLICT, 'Professional profile already exists.')
  }

  // ?? Check the abn number already in used:
  const hasAnyAssociatedWithThisAbn = await ArtistProfile.findOne({
    user: {
      $ne: user?._id,
    },
    abn,
  })

  if (hasAnyAssociatedWithThisAbn) {
    throw new AppError(httpStatus.CONFLICT, 'The abn number already in use.')
  }

  // ?? Check the phone number already in used:
  const hasAnyAssociatedWithThisPhone = await User.findOne({
    _id: {
      $ne: user?._id,
    },
    phone,
  })

  if (hasAnyAssociatedWithThisPhone) {
    throw new AppError(httpStatus.CONFLICT, 'The phone number already in use.')
  }

  const drivingLicenseFrontSideFile = files?.drivingLicenseFrontSide?.[0]
  const drivingLicenseBackSideFile = files?.drivingLicenseBackSide?.[0]
  const selfieFile = files?.selfie?.[0]
  const profileImageFile = files.profileImage?.[0]

  const deletableFiles = []

  if (!drivingLicenseFrontSideFile) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Driving license front side is required.')
  }

  if (!drivingLicenseBackSideFile) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Driving license backside is required.')
  }

  if (!selfieFile) {
    throw new AppError(httpStatus.BAD_REQUEST, 'selfie is required.')
  }

  let drivingLicenseFrontSideUrl = undefined
  let drivingLicenseBackSideUrl = undefined
  let selfieUrl = undefined
  let profileImageUrl = user?.profileImage ?? undefined

  if (drivingLicenseFrontSideFile) {
    const { url } = await uploadSingleFileToS3(
      drivingLicenseFrontSideFile,
      AWS_FOLDER_NAMES.Licenses
    )

    drivingLicenseFrontSideUrl = url
  }

  if (drivingLicenseBackSideFile) {
    const { url } = await uploadSingleFileToS3(
      drivingLicenseBackSideFile,
      AWS_FOLDER_NAMES.Licenses
    )

    drivingLicenseBackSideUrl = url
  }

  if (selfieFile) {
    const { url } = await uploadSingleFileToS3(selfieFile, AWS_FOLDER_NAMES.Selfies)
    selfieUrl = url
  }

  if (profileImageFile) {
    const { url } = await uploadSingleFileToS3(profileImageFile, AWS_FOLDER_NAMES.ProfileImage)

    if (url && user.profileImage) deletableFiles.push(user.profileImage)
    profileImageUrl = url
  }

  const mongoSession = await mongoose.startSession()

  try {
    mongoSession.startTransaction()

    const professionalProfile = await ArtistProfile.create(
      [
        {
          user: user?._id,
          businessName,
          abn, // Australian Business Number
          businessAddress,
          yearOfExperience,
          professionalBio,

          // Verification section:
          drivingLicenseFrontSide: drivingLicenseFrontSideUrl,
          drivingLicenseBackSide: drivingLicenseBackSideUrl,
          selfie: selfieUrl,

          // Address info:
          location: {
            type: 'Point',
            coordinates: [longitude, latitude],
          },
          city,
          state,
          postalCode,
          website,
          instagram,
          facebook,

          language,
          travelRadius,
        },
      ],
      {
        session: mongoSession,
      }
    )

    if (!professionalProfile) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Professional profile failed to update.')
    }

    if (phone !== undefined) user.phone = phone
    if (profileImageUrl !== undefined) user.profileImage = profileImageUrl

    user.isProfileCompleted = true

    await user.save({ session: mongoSession })

    await mongoSession.commitTransaction()
    return professionalProfile
  } catch (error) {
    await mongoSession.abortTransaction()
    throw error
  } finally {
    await mongoSession.endSession()
  }
}

const updateArtistProfile = async (id: string, payload: TUpdateArtistProfilePayloadType) => {
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
