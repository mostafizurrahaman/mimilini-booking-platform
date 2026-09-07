import {
  Banner,
  bannerSearchableFields,
  bannerSortableFields,
  BannerStatus,
  type IUser,
  type TBannerPriorityStatus,
} from '@repo/db'
import httpStatus from 'http-status'
import { AppError } from '@repo/shared'
import type { PipelineStage } from 'mongoose'

import type {
  TCreateBannerPayloadType,
  TUpdateBannerPayloadType,
  TGetAllBannerQueryParamsType,
  TGetAllActiveBannerQueryParamsType,
  TUpdateStatusPayloadType,
} from './banner.validations'
import moment from 'moment'
import {
  deleteSingleFileFromS3,
  uploadSingleFileToS3,
  type TMulterFile,
} from 'packages/media-hub/src'
import { AWS_FOLDER_NAMES, formatQuery, logger } from '@app/libs'

// ?? 1. Create Banner.
const createBanner = async (user: IUser, payload: TCreateBannerPayloadType, file: TMulterFile) => {
  const {
    title,
    subtitle,
    ctaBtnText,
    ctaDestination,
    startDate: stDate,
    endDate: edDate,
    priority,
    status,
  } = payload

  // ?? Check is file provided:
  if (!file) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Banner image is required.')
  }

  // start date and end Date:
  const todayStart = moment().startOf('day')
  const startDate = moment(stDate)
  const endDate = moment(edDate)

  if (startDate.isBefore(todayStart)) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Start date should be present or future date.')
  }

  if (endDate.isBefore(todayStart)) {
    throw new AppError(httpStatus.BAD_REQUEST, 'End date should be present or future date.')
  }

  if (endDate.isBefore(startDate)) {
    throw new AppError(httpStatus.BAD_REQUEST, 'End date must be after start date.')
  }

  if (endDate && startDate && startDate.isSame(edDate)) {
    throw new AppError(httpStatus.BAD_REQUEST, 'End date should be after start date.')
  }

  // ?? upload the banner url:
  const { url } = await uploadSingleFileToS3(file, AWS_FOLDER_NAMES.Banner)

  const bannerData = {
    title,
    subtitle,
    url: url,
    ctaBtnText,
    ctaDestination,
    priority: priority as TBannerPriorityStatus,
    status,
    startDate: startDate.toDate(),
    endDate: endDate?.toDate(),
    user: user?._id,
  }

  const result = await Banner.create(bannerData)
  return result
}

// ?? Update banner:
const updateBanner = async (id: string, payload: TUpdateBannerPayloadType, file: TMulterFile) => {
  const { title, subtitle, priority, ctaBtnText, ctaDestination, endDate, startDate, status } =
    payload

  // ?? Check is the banner exists ?:
  const existingBanner = await Banner.findById(id)
  if (!existingBanner) {
    throw new AppError(httpStatus.BAD_REQUEST, "Banner doesn't exists.")
  }

  // ?? Images:
  const oldImageUrl: string | undefined = existingBanner?.url
  let newImageUrl: string | undefined = undefined

  if (file) {
    const { url } = await uploadSingleFileToS3(file, AWS_FOLDER_NAMES.Banner)
    newImageUrl = url
    existingBanner.url = url
  }

  // ?? Filter out the dates:
  const today = moment().startOf('day')
  const stDate = startDate ? moment(startDate) : moment(existingBanner?.startDate)
  const edDate = endDate ? moment(endDate) : moment(existingBanner?.endDate)

  if (edDate && edDate.isBefore(today)) {
    throw new AppError(httpStatus.BAD_REQUEST, 'End date should be future date.')
  }

  if (edDate && stDate && edDate.isBefore(stDate)) {
    throw new AppError(httpStatus.BAD_REQUEST, 'End date should be after start date.')
  }

  if (edDate && stDate && stDate.isSame(edDate)) {
    throw new AppError(httpStatus.BAD_REQUEST, 'End date should be after start date.')
  }

  existingBanner.startDate = stDate?.toDate()
  existingBanner.endDate = edDate?.toDate()

  if (title !== undefined) existingBanner.title = title
  if (subtitle !== undefined) existingBanner.subtitle = subtitle
  if (priority !== undefined) existingBanner.priority = priority as TBannerPriorityStatus
  if (ctaBtnText !== undefined) existingBanner.ctaBtnText = ctaBtnText
  if (ctaDestination !== undefined) existingBanner.ctaDestination = ctaDestination
  if (status !== undefined) existingBanner.status = status

  await existingBanner.save()

  if (newImageUrl && oldImageUrl) {
    deleteSingleFileFromS3(oldImageUrl).catch((err) => logger.error('File upload error', err))
  }

  return existingBanner
}

const updateBannerStatus = async (bannerId: string, payload: TUpdateStatusPayloadType) => {
  const { status } = payload

  // ?? Check is the banner exists ?:
  const existingBanner = await Banner.findById(bannerId)
  if (!existingBanner) {
    throw new AppError(httpStatus.BAD_REQUEST, "Banner doesn't exists.")
  }

  if (existingBanner.status === BannerStatus.ACTIVE && status === BannerStatus.ACTIVE) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Banner already in active status.')
  }

  if (existingBanner.status === BannerStatus.INACTIVE && status === BannerStatus.INACTIVE) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Banner already in inactive status.')
  }

  existingBanner.status = status as TBannerStatusType

  await existingBanner.save()

  return existingBanner
}

const getAllBanner = async (query: TGetAllBannerQueryParamsType) => {
  const { page, limit, searchTerm, sortOrder, sortBy, fromDate, toDate } = formatQuery(
    query,
    bannerSortableFields
  )

  const skip = (page - 1) * limit
  const pipeline: PipelineStage[] = []

  if (fromDate || toDate) {
    const dateFilter: Record<string, unknown> = {}
    if (fromDate) {
      dateFilter.startDate = {
        $gte: moment(fromDate)?.startOf('day')?.toDate(),
      }
    }
    if (toDate) {
      dateFilter.endDate = {
        $lte: moment(fromDate)?.endOf('day')?.toDate(),
      }
    }
  }

  pipeline.push(
    {
      $lookup: {
        from: 'users',
        localField: 'user',
        foreignField: '_id',
        as: 'userDetails',
        pipeline: [
          {
            $project: {
              userId: '$_id',
              userName: '$name',
              userEmail: '$email',
            },
          },
        ],
      },
    },
    {
      $unwind: {
        path: '$userDetails',
        preserveNullAndEmptyArrays: true,
      },
    }
  )

  pipeline.push({
    $addFields: {
      userId: '$userDetails._id',
      userName: '$userDetails.userName',
      userEmail: '$userDetails.userEmail',
    },
  })

  pipeline.push({
    $project: {
      userDetails: 0,
    },
  })

  if (searchTerm) {
    pipeline.push({
      $match: {
        $or: bannerSearchableFields.map((field) => ({
          [field]: { $regex: searchTerm, $options: 'i' },
        })),
      },
    })
  }

  pipeline.push({ $sort: { [sortBy]: sortOrder } })

  pipeline.push({
    $facet: {
      data: [{ $skip: skip }, { $limit: limit }],
      meta: [{ $count: 'total' }],
    },
  })

  const aggregated = await Banner.aggregate(pipeline)

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

const getAllActiveBanner = async (query: TGetAllActiveBannerQueryParamsType) => {
  const { skipPagination } = query
  const { page, limit, searchTerm } = formatQuery(query, bannerSortableFields)

  const skip = (page - 1) * limit
  const pipeline: PipelineStage[] = []
  const isPaginationSkipped =
    typeof skipPagination === 'string'
      ? skipPagination === 'true'
      : typeof skipPagination === 'boolean'
        ? skipPagination
        : false

  // ?? Start Date:
  const today = moment()

  pipeline.push({
    $match: {
      startDate: {
        $lte: today?.toDate(),
      },
      endDate: {
        $gte: today?.toDate(),
      },
      status: BannerStatus.ACTIVE,
    },
  })

  pipeline.push(
    {
      $lookup: {
        from: 'users',
        localField: 'user',
        foreignField: '_id',
        as: 'userDetails',
        pipeline: [
          {
            $project: {
              userId: '$_id',
              userName: '$name',
              userEmail: '$email',
            },
          },
        ],
      },
    },
    {
      $unwind: {
        path: '$userDetails',
        preserveNullAndEmptyArrays: true,
      },
    }
  )

  pipeline.push({
    $addFields: {
      userId: '$userDetails._id',
      userName: '$userDetails.userName',
      userEmail: '$userDetails.userEmail',
    },
  })

  pipeline.push({
    $project: {
      userDetails: 0,
    },
  })

  if (searchTerm) {
    pipeline.push({
      $match: {
        $or: bannerSearchableFields.map((field) => ({
          [field]: { $regex: searchTerm, $options: 'i' },
        })),
      },
    })
  }

  pipeline.push({ $sort: { priority: -1 } })

  const paginationStage: PipelineStage.FacetPipelineStage[] = []

  if (isPaginationSkipped) {
    paginationStage.push({
      $match: {},
    })
  } else {
    paginationStage.push({ $skip: skip }, { $limit: limit })
  }

  pipeline.push({
    $facet: {
      data: paginationStage,
      meta: [{ $count: 'total' }],
    },
  })

  const aggregated = await Banner.aggregate(pipeline)

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

const getBannerById = async (id: string) => {
  const result = await Banner.findById(id)

  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, 'Banner not found')
  }

  return result
}

const deleteBannerById = async (id: string) => {
  const result = await Banner.findOneAndDelete({ _id: id })

  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, 'Banner not found')
  }

  return result
}

export const bannerServices = {
  createBanner,
  updateBanner,
  getAllBanner,
  getBannerById,
  deleteBannerById,
  getAllActiveBanner,
  updateBannerStatus,
}
