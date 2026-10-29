import {
  ArtistProfile,
  FavoriteArtist,
  ArtistServices,
  artistProfileSearchableFields,
  AuthStatus,
  Review,
  User,
  verificationStatus,
  type IUser,
  type IArtistCertification,
} from '@repo/db'
import httpStatus from 'http-status'
import { AppError, getUserFromRequest } from '@repo/shared'
import type { PipelineStage } from 'mongoose'
import moment from 'moment'
import { availabilityServices } from '../Availability/availability.services'
import { calculateDistanceKm } from '../Booking/booking.utils'

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
    isGstRegistered, 
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
          isGstRegistered,
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
          facebook: facebook!,
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

// ?? Add Single Certification (one by one):
export interface IAddCertificationPayload {
  name?: string
  issuedAt?: string | Date
  url?: string
}

const addCertification = async (
  user: IUser,
  certificateFile?: TMulterFile,
  payload?: IAddCertificationPayload
) => {
  const artistProfile = await ArtistProfile.findOne({
    user: user?._id,
  })

  if (!artistProfile) {
    throw new AppError(httpStatus.BAD_REQUEST, "Artist profile doesn't exist.")
  }

  const previousFiles = (artistProfile.certifications ?? []) as IArtistCertification[]
  if (previousFiles.length >= 20) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'You cannot upload more than 20 certificates. Already uploaded 20.'
    )
  }

  const certName =
    payload?.name?.trim() ||
    (certificateFile?.originalname
      ? certificateFile.originalname.replace(/\.[^/.]+$/, '').trim()
      : '') ||
    `Certificate ${previousFiles.length + 1}`

  // Prevent duplicate certificate by name or url
  const isDuplicateName = previousFiles.some(
    (cert) => cert.name?.trim().toLowerCase() === certName.toLowerCase()
  )
  if (isDuplicateName) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `A certificate with the name "${certName}" already exists.`
    )
  }

  if (payload?.url?.trim()) {
    const isDuplicateUrl = previousFiles.some(
      (cert) => cert.url?.trim() === payload.url?.trim()
    )
    if (isDuplicateUrl) {
      throw new AppError(httpStatus.BAD_REQUEST, 'This certificate already exists.')
    }
  }

  let certUrl = payload?.url?.trim()

  if (certificateFile) {
    const uploaded = await uploadSingleFileToS3(
      certificateFile,
      AWS_FOLDER_NAMES.Certifications
    )
    if (!uploaded?.url) {
      throw new AppError(
        httpStatus.INTERNAL_SERVER_ERROR,
        'Certificate failed to upload. Please try again.'
      )
    }
    certUrl = uploaded.url
  }

  if (!certUrl) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Certificate file or image URL is required.'
    )
  }

  try {
    let issuedAt: Date | undefined
    if (payload?.issuedAt) {
      const parsedDate = new Date(payload.issuedAt)
      if (!isNaN(parsedDate.getTime())) {
        issuedAt = parsedDate
      }
    }

    const newCertification: IArtistCertification = {
      name: certName,
      url: certUrl,
      ...(issuedAt ? { issuedAt } : {}),
    }

    artistProfile.certifications = [...previousFiles, newCertification]
    await artistProfile.save()

    return artistProfile
  } catch (error) {
    // Prevent orphaned S3 image if saving to DB fails
    if (certificateFile && certUrl) {
      await deleteSingleFileFromS3(certUrl).catch((err) =>
        console.error('Failed to cleanup orphaned S3 file on certification error:', err)
      )
    }
    throw error
  }
}

// ?? Remove Single Certification (one by one):
const removeCertification = async (
  user: IUser,
  payload: { url?: string; certificationId?: string }
) => {
  const artistProfile = await ArtistProfile.findOne({ user: user?._id })
  if (!artistProfile) {
    throw new AppError(httpStatus.BAD_REQUEST, "Artist profile doesn't exist.")
  }

  const certifications = (artistProfile.certifications ?? []) as IArtistCertification[]
  if (certifications.length < 1) {
    throw new AppError(httpStatus.BAD_REQUEST, 'No certificate exists.')
  }

  const { certificationId, url } = payload || {}

  const targetIndex = certifications.findIndex((cert) => {
    if (certificationId && cert?._id?.toString() === certificationId.trim()) {
      return true
    }
    if (url && cert?.url?.trim() === url.trim()) {
      return true
    }
    return false
  })

  if (targetIndex === -1) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Given certificate not found.')
  }

  const [removedCert] = certifications.splice(targetIndex, 1)
  artistProfile.certifications = certifications

  await artistProfile.save()

  // Clean up S3 file to prevent orphaned images
  if (removedCert?.url) {
    await deleteSingleFileFromS3(removedCert.url).catch((err) =>
      console.error('Failed to delete S3 file for removed certificate:', err)
    )
  }

  return artistProfile
}

const getAllArtistProfile = async (query: Partial<TGetAllArtistProfileQueryParamsType>) => {
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

  // Exclude penalized artists from public/customer discovery unless explicitly requested
  if ((query as any).includePenaltyRequired !== 'true') {
    pipeline.push({
      $match: {
        isPenaltyRequired: { $ne: true },
      },
    })
  }

  // Filter out incomplete and non-stripe-connected artists for customer discovery
  if (query.includeInActive !== true) {
    pipeline.push(
      {
        $lookup: {
          from: 'users',
          localField: 'user',
          foreignField: '_id',
          as: 'userDetails',
        },
      },
      { $unwind: '$userDetails' },
      {
        $match: {
          'userDetails.status': AuthStatus.ACTIVE,
          'userDetails.isProfileCompleted': true,
          'userDetails.isStripeConnected': true,
        },
      }
    )
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

export interface IFindArtistsQuery {
  latitude?: number | string
  longitude?: number | string
  date?: string
  time?: string
  categoryId?: string
  artistId?: string
  searchTerm?: string
  sortBy?: string
  sortOrder?: 'asc' | 'desc' | string
  guestCount?: number | string
  radius?: number | string
  availableToday?: boolean | string
  page?: number | string
  limit?: number | string
}

const findAvailableArtists = async (query: IFindArtistsQuery) => {
  const {
    latitude,
    longitude,
    date,
    time,
    categoryId,
    artistId,
    searchTerm,
    sortBy,
    sortOrder,
    radius,
    availableToday,
    guestCount = 1,
    page = 1,
    limit = 10,
  } = query

  const pageNum = Math.max(1, Number(page) || 1)
  const limitNum = Math.max(1, Number(limit) || 10)
  const guests = Math.max(1, Number(guestCount) || 1)

  const hasLocation =
    latitude !== undefined &&
    longitude !== undefined &&
    !isNaN(Number(latitude)) &&
    !isNaN(Number(longitude))

  const pipeline: PipelineStage[] = []

  // Resolve artistId filter if provided
  const targetArtistId =
    artistId && mongoose.isValidObjectId(artistId)
      ? new mongoose.Types.ObjectId(artistId)
      : null

  const initialMatch: any = {
    isPenaltyRequired: { $ne: true },
  }
  if (targetArtistId) {
    initialMatch.$or = [{ user: targetArtistId }, { _id: targetArtistId }]
  }

  // 1. Location and Radius Filtering (Matches distance with user search radius and artist's travelRadius)
  if (hasLocation) {
    pipeline.push({
      $geoNear: {
        near: {
          type: 'Point',
          coordinates: [Number(longitude), Number(latitude)],
        },
        distanceField: 'distanceMeters',
        spherical: true,
        query: initialMatch,
      },
    })

    const userRadiusKm = radius && !isNaN(Number(radius)) ? Number(radius) : null

    pipeline.push({
      $match: {
        $expr: {
          $lte: [
            { $divide: ['$distanceMeters', 1000] },
            userRadiusKm
              ? { $min: [userRadiusKm, { $ifNull: ['$travelRadius', 50] }] }
              : { $ifNull: ['$travelRadius', 50] },
          ],
        },
      },
    })
  } else {
    pipeline.push({
      $match: initialMatch,
    })
  }

  // 2. User status check (only active, profile completed, and stripe connected artists)
  pipeline.push(
    {
      $lookup: {
        from: 'users',
        localField: 'user',
        foreignField: '_id',
        as: 'userDetails',
      },
    },
    { $unwind: '$userDetails' },
    {
      $match: {
        'userDetails.status': AuthStatus.ACTIVE,
        'userDetails.isProfileCompleted': true,
        'userDetails.isStripeConnected': true,
      },
    }
  )

  // 3. Category filtering and Services lookup
  const categoryObjectId =
    categoryId && mongoose.isValidObjectId(categoryId)
      ? new mongoose.Types.ObjectId(categoryId)
      : null

  pipeline.push({
    $lookup: {
      from: 'artistservices',
      let: { artistUserId: '$user' },
      pipeline: [
        {
          $match: {
            $expr: {
              $and: [
                { $eq: ['$artist', '$$artistUserId'] },
                { $eq: ['$isActive', true] },
                ...(categoryObjectId
                  ? [{ $eq: ['$category', categoryObjectId] }]
                  : []),
              ],
            },
          },
        },
        {
          $lookup: {
            from: 'categories',
            localField: 'category',
            foreignField: '_id',
            as: 'categoryDoc',
          },
        },
        {
          $unwind: {
            path: '$categoryDoc',
            preserveNullAndEmptyArrays: true,
          },
        },
      ],
      as: 'services',
    },
  })

  // If categoryId was provided, only keep artists offering active services in this category
  if (categoryObjectId) {
    pipeline.push({
      $match: {
        'services.0': { $exists: true },
      },
    })
  }

  // 3.1 Search term filtering (artist name, business name, bio, service name, category name)
  const effectiveSearch = (searchTerm || '').toString().trim()
  if (effectiveSearch) {
    const searchRegex = new RegExp(effectiveSearch, 'i')
    pipeline.push({
      $match: {
        $or: [
          { 'userDetails.name': searchRegex },
          { businessName: searchRegex },
          { professionalBio: searchRegex },
          { 'services.name': searchRegex },
          { 'services.categoryDoc.name': searchRegex },
        ],
      },
    })
  }

  // 4. Reviews lookup for rating and review count
  pipeline.push({
    $lookup: {
      from: 'reviews',
      let: { artistUserId: '$user' },
      pipeline: [
        {
          $match: {
            $expr: {
              $and: [
                { $eq: ['$artist', '$$artistUserId'] },
                { $eq: ['$isActive', true] },
              ],
            },
          },
        },
        {
          $group: {
            _id: null,
            avgRating: { $avg: '$rating' },
            totalReviews: { $sum: 1 },
          },
        },
      ],
      as: 'reviewStats',
    },
  })

  // 5. Date / Weekly schedule availability filtering if date is provided
  if (date) {
    const dayOfWeek = moment(date).format('dddd').toLowerCase()
    const isWorkingDayField = `availabilityDoc.weeklySchedule.${dayOfWeek}.isWorkingDay`
    const startOfDay = moment(date).startOf('day').toDate()
    const endOfDay = moment(date).endOf('day').toDate()

    pipeline.push(
      {
        $lookup: {
          from: 'availabilities',
          localField: 'user',
          foreignField: 'artist',
          as: 'availabilityDoc',
        },
      },
      {
        $unwind: {
          path: '$availabilityDoc',
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $match: {
          $nor: [
            {
              'availabilityDoc.vacationMode.isVacationMode': true,
              'availabilityDoc.vacationMode.startDate': { $lte: endOfDay },
              'availabilityDoc.vacationMode.endDate': { $gte: startOfDay },
            },
          ],
          $or: [
            { availabilityDoc: { $exists: false } },
            { [isWorkingDayField]: true },
          ],
        },
      },
      {
        $lookup: {
          from: 'artistblockeddates',
          let: { artistUserId: '$user' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$artist', '$$artistUserId'] },
                    { $gte: ['$date', startOfDay] },
                    { $lte: ['$date', endOfDay] },
                  ],
                },
              },
            },
          ],
          as: 'blockedDatesDoc',
        },
      },
      {
        $match: {
          'blockedDatesDoc.0': { $exists: false },
        },
      }
    )
  }

  // 6. Projection directly in aggregation pipeline
  pipeline.push({
    $project: {
      _id: 1,
      artistId: '$user',
      name: { $ifNull: ['$userDetails.name', '$businessName'] },
      businessName: 1,
      profileImage: {
        $ifNull: [
          '$userDetails.profileImage',
          { $arrayElemAt: ['$portfolioImages', 0] },
        ],
      },
      category: {
        $ifNull: [
          { $arrayElemAt: ['$services.categoryDoc.name', 0] },
          'Beauty Artist',
        ],
      },
      headline: {
        $ifNull: [
          '$professionalBio',
          {
            $concat: [
              { $ifNull: [{ $arrayElemAt: ['$services.categoryDoc.name', 0] }, 'Beauty'] },
              ' Specialist',
            ],
          },
        ],
      },
      rating: {
        $ifNull: [
          { $round: [{ $arrayElemAt: ['$reviewStats.avgRating', 0] }, 1] },
          0,
        ],
      },
      reviewCount: {
        $ifNull: [{ $arrayElemAt: ['$reviewStats.totalReviews', 0] }, 0],
      },
      yearOfExperience: { $ifNull: ['$yearOfExperience', 0] },
      experienceText: {
        $concat: [
          { $toString: { $ifNull: ['$yearOfExperience', 0] } },
          ' yrs',
        ],
      },
      travelRadius: { $ifNull: ['$travelRadius', 15] },
      travelRadiusText: {
        $concat: [
          { $toString: { $ifNull: ['$travelRadius', 15] } },
          ' km radius',
        ],
      },
      distanceKm: {
        $cond: {
          if: { $ne: [{ $type: '$distanceMeters' }, 'missing'] },
          then: { $round: [{ $divide: ['$distanceMeters', 1000] }, 1] },
          else: null,
        },
      },
      distanceText: {
        $cond: {
          if: { $ne: [{ $type: '$distanceMeters' }, 'missing'] },
          then: {
            $concat: [
              { $toString: { $round: [{ $divide: ['$distanceMeters', 1000] }, 1] } },
              ' km away',
            ],
          },
          else: null,
        },
      },
      startingPrice: {
        $ifNull: [{ $min: '$services.price' }, 0],
      },
      sortPrice: {
        $cond: {
          if: {
            $and: [
              { $gt: [{ $size: '$services' }, 0] },
              { $gt: [{ $min: '$services.price' }, 0] },
            ],
          },
          then: { $min: '$services.price' },
          else: 999999,
        },
      },
      startingPriceText: {
        $concat: [
          'From $',
          { $toString: { $ifNull: [{ $min: '$services.price' }, 0] } },
        ],
      },
      matchedService: {
        $cond: {
          if: { $gt: [{ $size: '$services' }, 0] },
          then: {
            _id: { $arrayElemAt: ['$services._id', 0] },
            name: { $arrayElemAt: ['$services.name', 0] },
            price: { $arrayElemAt: ['$services.price', 0] },
            durationMinutes: { $arrayElemAt: ['$services.durationMinutes', 0] },
          },
          else: null,
        },
      },
      portfolio: {
        thumbnails: { $slice: [{ $ifNull: ['$portfolioImages', []] }, 3] },
        totalImages: { $size: { $ifNull: ['$portfolioImages', []] } },
        remainingCount: {
          $max: [0, { $subtract: [{ $size: { $ifNull: ['$portfolioImages', []] } }, 3] }],
        },
        badgeText: {
          $cond: {
            if: { $gt: [{ $subtract: [{ $size: { $ifNull: ['$portfolioImages', []] } }, 3] }, 0] },
            then: {
              $concat: [
                '+',
                { $toString: { $subtract: [{ $size: { $ifNull: ['$portfolioImages', []] } }, 3] } },
              ],
            },
            else: null,
          },
        },
      },
      certifications: { $ifNull: ['$certifications', []] },
      badges: {
        $setUnion: [
          {
            $cond: {
              if: { $eq: ['$userDetails.verificationStatus', 'verified'] },
              then: ['Verified'],
              else: [],
            },
          },
          {
            $cond: {
              if: { $gte: [{ $ifNull: ['$yearOfExperience', 0] }, 5] },
              then: ['Top Rated'],
              else: [],
            },
          },
        ],
      },
      isVerified: {
        $eq: ['$userDetails.verificationStatus', 'verified'],
      },
    },
  })

  // 6.1 Sorting (Most Popular, Highest Rated, Nearest, Low to High, High to Low)
  const rawSortBy = (sortBy || '')
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[-\s]/g, '_')
  const effectiveSortOrder = (sortOrder || '').toString().toLowerCase().trim()

  const sortStage: Record<string, 1 | -1> = {}

  if (
    rawSortBy === 'low_to_high' ||
    rawSortBy === 'price_low_to_high' ||
    rawSortBy === 'lowtohigh' ||
    ((rawSortBy === 'price' || rawSortBy === 'startingprice' || rawSortBy === 'cost') &&
      (effectiveSortOrder === 'asc' || effectiveSortOrder === '1'))
  ) {
    // Low to High (Price): lowest price first
    sortStage.sortPrice = 1
    sortStage.rating = -1
  } else if (
    rawSortBy === 'high_to_low' ||
    rawSortBy === 'price_high_to_low' ||
    rawSortBy === 'hightolow' ||
    ((rawSortBy === 'price' || rawSortBy === 'startingprice' || rawSortBy === 'cost') &&
      (effectiveSortOrder === 'desc' || effectiveSortOrder === '-1'))
  ) {
    // High to Low (Price): highest price first
    sortStage.startingPrice = -1
    sortStage.rating = -1
  } else if (
    rawSortBy === 'most_popular' ||
    rawSortBy === 'popular' ||
    rawSortBy === 'popularity' ||
    rawSortBy === 'reviews' ||
    rawSortBy === 'reviewcount'
  ) {
    // Most Popular: most reviews and high rating first
    sortStage.reviewCount = effectiveSortOrder === 'asc' ? 1 : -1
    sortStage.rating = -1
  } else if (
    rawSortBy === 'highest_rated' ||
    rawSortBy === 'rating' ||
    rawSortBy === 'top_rated'
  ) {
    // Highest Rated: top average rating first
    sortStage.rating = effectiveSortOrder === 'asc' ? 1 : -1
    sortStage.reviewCount = -1
  } else if (
    rawSortBy === 'nearest' ||
    rawSortBy === 'distance' ||
    rawSortBy === 'distancekm'
  ) {
    // Nearest: closest distance in KM first
    if (hasLocation) {
      sortStage.distanceKm = effectiveSortOrder === 'desc' ? -1 : 1
    } else {
      sortStage.rating = -1
      sortStage.reviewCount = -1
    }
  } else if (rawSortBy === 'experience' || rawSortBy === 'yearofexperience') {
    sortStage.yearOfExperience = effectiveSortOrder === 'asc' ? 1 : -1
  } else if (rawSortBy === 'newest' || rawSortBy === 'createdat') {
    sortStage._id = effectiveSortOrder === 'asc' ? 1 : -1
  } else if (hasLocation) {
    // Default with coordinates: Nearest distance first
    sortStage.distanceKm = 1
  } else {
    // Default without coordinates: Highest rating & popularity first
    sortStage.rating = -1
    sortStage.reviewCount = -1
  }

  pipeline.push({ $sort: sortStage })

  // 7. Aggregation Pagination with $facet
  const skip = (pageNum - 1) * limitNum

  pipeline.push({
    $facet: {
      data: [
        { $skip: skip },
        { $limit: limitNum },
      ],
      totalCount: [
        { $count: 'total' },
      ],
    },
  })

  const [facetResult] = await ArtistProfile.aggregate(pipeline)
  const paginatedArtists = (facetResult?.data || []) as any[]
  const total = facetResult?.totalCount?.[0]?.total || 0

  // 8. Enrich slots on paginated slice
  const enrichedData = await Promise.all(
    paginatedArtists.map(async (artist) => {
      let isAvailable = true
      let availableSlots: string[] = []
      let matchedSlotTime: string | null = null
      let isAvailableToday = false

      const artistUserId = artist.artistId?.toString?.() || artist.artistId

      try {
        const todaySlots = await availabilityServices.getArtistAvailableSlotsForDate(
          artistUserId,
          moment().format('YYYY-MM-DD'),
          60
        )
        isAvailableToday = (todaySlots?.availableSlotsCount || 0) > 0
      } catch {
        isAvailableToday = false
      }

      if (
        availableToday === true ||
        availableToday === 'true' ||
        rawSortBy === 'available_today'
      ) {
        if (!isAvailableToday) {
          return null
        }
      }

      if (date) {
        const duration = (artist.matchedService?.durationMinutes || 60) * guests
        try {
          const slotsData = await availabilityServices.getArtistAvailableSlotsForDate(
            artistUserId,
            date,
            duration
          )
          if (!slotsData.isWorkingDay || slotsData.availableSlotsCount === 0 || slotsData.isMaxBookingReached) {
            isAvailable = false
          } else {
            availableSlots = slotsData.availableSlots.map((s) => s.startTime)
            if (time) {
              matchedSlotTime = availableSlots.includes(time) ? time : null
              if (!matchedSlotTime) {
                isAvailable = false
              }
            }
          }
        } catch {
          isAvailable = false
        }
      }

      const badges = [...(artist.badges || [])]
      if (isAvailableToday && !badges.includes('Available Today')) {
        badges.push('Available Today')
      }

      return {
        ...artist,
        badges,
        isAvailableToday,
        isAvailable,
        availableSlots: availableSlots.slice(0, 5),
        matchedSlotTime,
      }
    })
  )

  const filteredData = enrichedData.filter(Boolean) as typeof paginatedArtists

  return {
    data: filteredData,
    meta: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum) || 1,
    },
  }
}

export interface IGetArtistDetailsQuery {
  date?: string
  serviceId?: string
  latitude?: string | number
  longitude?: string | number
}

const getArtistDetails = async (artistIdParam: string, query: IGetArtistDetailsQuery = {}, currentUserId?: string | mongoose.Types.ObjectId) => {
  if (!mongoose.isValidObjectId(artistIdParam)) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Invalid artist ID.')
  }

  const targetId = new mongoose.Types.ObjectId(artistIdParam)

  // Find ArtistProfile by either profile _id or user ID
  const artistProfile = await ArtistProfile.findOne({
    $or: [{ _id: targetId }, { user: targetId }],
    isPenaltyRequired: { $ne: true },
  })

  if (!artistProfile) {
    throw new AppError(httpStatus.NOT_FOUND, 'Artist profile not found.')
  }

  const artistUserId = artistProfile.user

  // Find corresponding User account
  const userDoc = await User.findById(artistUserId).lean()
  if (
    !userDoc ||
    userDoc.status !== AuthStatus.ACTIVE ||
    !userDoc.isProfileCompleted ||
    !userDoc.isStripeConnected
  ) {
    throw new AppError(
      httpStatus.NOT_FOUND,
      'Artist profile is currently unavailable or onboarding is incomplete.'
    )
  }

  // 1. Review statistics and recent reviews
  const [reviewStats, recentReviews] = await Promise.all([
    Review.aggregate([
      {
        $match: {
          artist: new mongoose.Types.ObjectId(artistUserId.toString()),
          isActive: true,
        },
      },
      {
        $group: {
          _id: null,
          avgRating: { $avg: '$rating' },
          totalCount: { $sum: 1 },
        },
      },
    ]),
    Review.find({ artist: artistUserId, isActive: true })
      .sort({ createdAt: -1 })
      .limit(3)
      .populate('customer', 'name profileImage')
      .lean(),
  ])

  const avgRating = reviewStats[0]?.avgRating
    ? Math.round(reviewStats[0].avgRating * 10) / 10
    : 0
  const totalReviews = reviewStats[0]?.totalCount || 0

  const formattedRecentReviews = recentReviews.map((rev: any) => {
    const custName = rev.customer?.name || 'Customer'
    return {
      _id: rev._id,
      rating: rev.rating,
      comment: rev.comment || '',
      createdAt: rev.createdAt,
      timeAgo: moment(rev.createdAt).fromNow(),
      customer: {
        _id: rev.customer?._id,
        name: custName,
        profileImage: rev.customer?.profileImage || null,
        initial: custName.charAt(0).toUpperCase(),
      },
    }
  })

  // 2. Services Offered
  const services = await ArtistServices.find({ artist: artistUserId, isActive: true })
    .populate('category', 'name')
    .sort({ isPopular: -1, price: -1 })
    .lean()

  const formattedServices = services.map((s: any) => {
    const duration = s.durationMinutes || 60
    let durationText = `${duration} min`
    if (duration >= 60) {
      const hrs = duration / 60
      durationText = Number.isInteger(hrs)
        ? `${hrs} ${hrs > 1 ? 'hrs' : 'hr'}`
        : `${hrs} hrs`
    }

    return {
      _id: s._id,
      name: s.name,
      description: s.description || '',
      price: s.price ?? 0,
      priceText: `$${s.price ?? 0}`,
      durationMinutes: duration,
      durationText,
      isPopular: Boolean(s.isPopular),
      badge: s.isPopular ? 'Popular' : null,
      category: s.category
        ? {
            _id: s.category._id,
            name: s.category.name,
          }
        : null,
    }
  })

  // 3. Specialties tags
  const specialtiesSet = new Set<string>()
  formattedServices.forEach((s) => {
    if (s.category?.name) specialtiesSet.add(s.category.name)
    if (/bridal/i.test(s.name)) specialtiesSet.add('Bridal')
    if (/editorial/i.test(s.name)) specialtiesSet.add('Editorial')
    if (/hair/i.test(s.name)) specialtiesSet.add('Hair')
    if (/skin/i.test(s.name)) specialtiesSet.add('Skincare')
  })
  if (specialtiesSet.size === 0) {
    specialtiesSet.add('Bridal')
    specialtiesSet.add('Editorial')
    specialtiesSet.add('Specialist')
  }
  const specialties = Array.from(specialtiesSet)

  // 4. Availability 7-day strip & selected date slots
  const queryDateStr = query.date
  const baseDate =
    queryDateStr && moment(queryDateStr, 'YYYY-MM-DD').isValid()
      ? moment(queryDateStr, 'YYYY-MM-DD')
      : moment()

  let targetServiceDuration = 60
  if (query.serviceId) {
    const matchedSvc = formattedServices.find(
      (s) => s._id.toString() === query.serviceId
    )
    if (!matchedSvc) {
      throw new AppError(
        httpStatus.NOT_FOUND,
        'Selected service does not exist for this artist.'
      )
    }
    targetServiceDuration = matchedSvc.durationMinutes
  } else if (formattedServices.length > 0 && formattedServices[0]?.durationMinutes) {
    targetServiceDuration = formattedServices[0].durationMinutes
  }

  const weekDays = []
  for (let i = 0; i < 7; i++) {
    const current = baseDate.clone().add(i, 'days')
    const dateStr = current.format('YYYY-MM-DD')
    const isToday = current.isSame(moment(), 'day')

    let hasSlots = false
    try {
      const slotsInfo = await availabilityServices.getArtistAvailableSlotsForDate(
        artistUserId.toString(),
        dateStr,
        targetServiceDuration
      )
      hasSlots = (slotsInfo?.availableSlotsCount || 0) > 0
    } catch {
      hasSlots = false
    }

    weekDays.push({
      date: dateStr,
      dayNumber: current.date(),
      dayName: current.format('ddd'),
      hasSlots,
      isAvailable: hasSlots,
      isToday,
      isSelected: i === 0,
    })
  }

  const selectedDay = weekDays.find((d) => d.hasSlots) || weekDays[0]
  const selectedDateStr = selectedDay ? selectedDay.date : baseDate.format('YYYY-MM-DD')
  let availableSlotsList: Array<{ startTime: string; endTime: string; formattedTime: string }> = []
  let isWorkingDay = false

  try {
    const daySlotsInfo = await availabilityServices.getArtistAvailableSlotsForDate(
      artistUserId.toString(),
      selectedDateStr,
      targetServiceDuration
    )
    isWorkingDay = daySlotsInfo?.isWorkingDay ?? false
    availableSlotsList = (daySlotsInfo?.availableSlots || []).map((slot: any) => ({
      startTime: slot.startTime,
      endTime: slot.endTime,
      formattedTime: moment(slot.startTime, 'HH:mm').format('h:mm A'),
    }))
  } catch {
    // Graceful fallback
  }

  const isAvailableToday = weekDays[0]?.hasSlots ?? false

  // 5. Badges
  const badges: string[] = []
  const isVerified = userDoc.verificationStatus === 'verified'
  if (isVerified) badges.push('Verified Artist')
  if (isAvailableToday) badges.push('Available Today')
  if ((artistProfile.yearOfExperience || 0) >= 5 || avgRating >= 4.8) {
    badges.push('Top Rated')
  }

  // 6. Location, distance, travel radius
  const travelRadius = artistProfile.travelRadius || 15
  const formattedLocation =
    [artistProfile.city, artistProfile.state].filter(Boolean).join(', ') ||
    artistProfile.businessAddress ||
    'Australia'

  let distanceKm: number | null = null
  let isWithinTravelRadius: boolean | null = null

  if (
    query.latitude !== undefined &&
    query.longitude !== undefined &&
    artistProfile.location?.coordinates
  ) {
    const custLat = Number(query.latitude)
    const custLng = Number(query.longitude)
    if (!isNaN(custLat) && !isNaN(custLng)) {
      distanceKm = calculateDistanceKm(
        [custLng, custLat],
        artistProfile.location.coordinates
      )
      isWithinTravelRadius = distanceKm <= travelRadius
    }
  }

  const headline =
    artistProfile.professionalBio?.slice(0, 50) ||
    (specialties.length > 0 ? `${specialties.join(' & ')} Specialist` : 'Beauty Artist')

  return {
    artistId: artistUserId,
    profileId: artistProfile._id,
    name: userDoc.name || artistProfile.businessName || 'Beauty Artist',
    profileImage: userDoc.profileImage || artistProfile.portfolioImages?.[0] || null,
    businessName: artistProfile.businessName || userDoc.name,
    headline,
    isVerified,
    badges,
    isAvailableToday,
    rating: avgRating,
    reviewCount: totalReviews,
    location: {
      city: artistProfile.city || '',
      state: artistProfile.state || '',
      postalCode: artistProfile.postalCode || '',
      businessAddress: artistProfile.businessAddress || '',
      formattedLocation,
    },
    distanceKm,
    distanceText: distanceKm !== null ? `${distanceKm} km away` : null,
    travelRadius,
    travelRadiusText: `Travels up to ${travelRadius} km`,
    travelCoverageText: `Covers ${formattedLocation} & surrounding areas`,
    isWithinTravelRadius,
    freeTravelIncluded: true,

    // Photos (Portfolio)
    portfolioImages: artistProfile.portfolioImages || [],

    // Services Offered
    services: formattedServices,

    // Experience
    experience: {
      years: artistProfile.yearOfExperience || 0,
      yearsText: `${artistProfile.yearOfExperience || 0} YRS`,
      title: 'Years of Experience',
      subtitle: 'Professional Beauty Artist',
      bio: artistProfile.professionalBio || '',
      specialties,
    },

    // Certifications
    certifications: artistProfile.certifications || [],

    // Reviews
    reviews: {
      avgRating,
      totalCount: totalReviews,
      recent: formattedRecentReviews,
    },

    // Favorite status
    isFavorite: currentUserId && mongoose.isValidObjectId(currentUserId)
      ? !!(await FavoriteArtist.exists({
          user: new mongoose.Types.ObjectId(String(currentUserId)),
          artist: artistUserId,
        }))
      : false,

    // Availability Preview (Screen 15.png)
    availability: {
      selectedDate: selectedDateStr,
      selectedDateText: `AVAILABLE TIMES — ${moment(selectedDateStr).format('MMMM D')}`,
      isWorkingDay,
      weekDays,
      availableSlots: availableSlotsList,
    },
  }
}


/**
 * Toggle Save / Favorite an Artist (Customer Wishlist)
 */
const toggleFavoriteArtist = async (
  userId: string | mongoose.Types.ObjectId,
  artistIdParam: string
) => {
  if (!mongoose.isValidObjectId(artistIdParam)) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Invalid artist ID.')
  }
  const targetId = new mongoose.Types.ObjectId(artistIdParam)

  const artistProfile = await ArtistProfile.findOne({
    $or: [{ _id: targetId }, { user: targetId }],
  })
  if (!artistProfile) {
    throw new AppError(httpStatus.NOT_FOUND, 'Artist not found.')
  }
  const artistUserId = artistProfile.user

  const customerId = new mongoose.Types.ObjectId(String(userId))
  if (String(customerId) === String(artistUserId)) {
    throw new AppError(httpStatus.BAD_REQUEST, 'You cannot favorite yourself.')
  }

  const existing = await FavoriteArtist.findOne({ user: customerId, artist: artistUserId })

  if (existing) {
    await FavoriteArtist.deleteOne({ _id: existing._id })
    return { isFavorite: false, message: 'Artist removed from favorites' }
  } else {
    await FavoriteArtist.create({ user: customerId, artist: artistUserId })
    return { isFavorite: true, message: 'Artist saved to favorites' }
  }
}

/**
 * Get logged-in customer's saved / favorite artists list
 */
const getMyFavoriteArtists = async (
  userId: string | mongoose.Types.ObjectId,
  query: { page?: number | string; limit?: number | string } = {}
) => {
  const page = Math.max(1, Number(query.page) || 1)
  const limit = Math.max(1, Math.min(100, Number(query.limit) || 20))
  const skip = (page - 1) * limit

  const customerId = new mongoose.Types.ObjectId(String(userId))

  const [favorites, total] = await Promise.all([
    FavoriteArtist.find({ user: customerId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    FavoriteArtist.countDocuments({ user: customerId }),
  ])

  const artistUserIds = favorites.map((f) => f.artist)

  const [profiles, services, reviewStats] = await Promise.all([
    ArtistProfile.find({
      user: { $in: artistUserIds },
      isPenaltyRequired: { $ne: true },
    })
      .populate('user', 'name email profileImage phone')
      .lean(),
    ArtistServices.find({
      artist: { $in: artistUserIds },
      isActive: true,
    })
      .populate('category', 'name icon')
      .lean(),
    Review.aggregate<{ _id: mongoose.Types.ObjectId; avgRating: number; totalReviews: number }>([
      { $match: { artist: { $in: artistUserIds }, isActive: true } },
      { $group: { _id: '$artist', avgRating: { $avg: '$rating' }, totalReviews: { $sum: 1 } } },
    ]),
  ])

  const reviewMap = new Map(reviewStats.map((r) => [String(r._id), r]))

  const data = profiles.map((p) => {
    const artistUserIdStr = String(p.user?._id || p.user)
    const artistServices = services.filter((s) => String(s.artist) === artistUserIdStr)
    const minPrice =
      artistServices.length > 0
        ? Math.min(...artistServices.map((s) => s.price || 0))
        : 0
    const primaryCategory = (artistServices[0] as any)?.category?.name || 'Beauty & Wellness'
    const stat = reviewMap.get(artistUserIdStr)

    return {
      artistId: p.user?._id || p.user,
      profileId: p._id,
      name: (p.user as any)?.name || p.businessName,
      profileImage: (p.user as any)?.profileImage || null,
      businessName: p.businessName,
      bio: p.professionalBio || '',
      rating: stat ? Number(stat.avgRating.toFixed(1)) : 0,
      totalReviews: stat ? stat.totalReviews : 0,
      startingPrice: minPrice,
      primaryCategory,
      travelRadius: p.travelRadius,
      isFavorite: true,
      servicesCount: artistServices.length,
    }
  })

  return {
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
    data,
  }
}

export const artistProfileServices = {
  toggleFavoriteArtist,
  getMyFavoriteArtists,
  createArtistProfile,
  updateArtistProfile,
  getAllArtistProfile,
  findAvailableArtists,
  getArtistDetails,

  // ?? Document Related Route:
  verifyArtistDocuments,
  rejectArtistDocuments,
  resubmitDocuments,
  getVerificationStatus,

  // ?? Portfolios:
  addPortFolio,
  removePortfolioImage,

  // ?? Certifications:
  addCertification,
  removeCertification,
}
