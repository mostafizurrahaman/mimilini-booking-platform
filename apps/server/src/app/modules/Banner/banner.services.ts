import { Banner, bannerSearchableFields, type IUser, type TBannerPriorityStatus } from '@repo/db'
import httpStatus from 'http-status'
import { AppError } from '@repo/shared'
import type { PipelineStage } from 'mongoose'

import type {
  TCreateBannerPayloadType,
  TUpdateBannerPayloadType,
  TGetAllBannerQueryParamsType,
} from './banner.validations'
import moment from 'moment'
import { uploadSingleFileToS3, type TMulterFile } from 'packages/media-hub/src'
import { AWS_FOLDER_NAMES } from '@app/libs'

// 1. Create Banner.
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

const updateBanner = async (id: string, payload: TUpdateBannerPayloadType) => {
  const result = await Banner.findOneAndUpdate({ _id: id }, { $set: payload }, { new: true })

  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, 'Banner not found')
  }

  return result
}

const getAllBanner = async (query: TGetAllBannerQueryParamsType) => {
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
        $or: bannerSearchableFields.map((field) => ({
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
}
