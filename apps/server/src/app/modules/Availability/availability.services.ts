import { Availability, availabilitySearchableFields  } from "@repo/db"
import httpStatus from "http-status"
import { AppError } from "@repo/shared"
import type { PipelineStage } from "mongoose"

import type {
  TCreateAvailabilityPayloadType,
  TUpdateAvailabilityPayloadType,
  TGetAllAvailabilityQueryParamsType
} from "./availability.validations"

const createAvailability = async (payload: TCreateAvailabilityPayloadType) => {
  const result = await Availability.create(payload)
  return result
}

const updateAvailability = async (id: string, payload: TUpdateAvailabilityPayloadType) => {
  const result = await Availability.findOneAndUpdate(
    { _id: id },
    { $set: payload },
    { new: true }
  )

  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, "Availability not found")
  }

  return result
}

const getAllAvailability = async (query: TGetAllAvailabilityQueryParamsType) => {
  const {
    page = 1,
    limit = 10,
    searchTerm,
    sortOrder = 'desc',
    sortBy = 'createdAt',
    fromDate,
    toDate
  } = query

  const skip = (page - 1) * limit
  const pipeline: PipelineStage[] = []

  if (fromDate || toDate) {
    const dateFilter : Record<string,unknown> = {}
    if (fromDate) dateFilter.$gte = new Date(fromDate)
    if (toDate) dateFilter.$lte = new Date(toDate)

    pipeline.push({ $match: { createdAt: dateFilter } })
  }

  if (searchTerm) {
    pipeline.push({
      $match: {
        $or: availabilitySearchableFields.map(field => ({
          [field]: { $regex: searchTerm, $options: 'i' }
        }))
      }
    })
  }

  pipeline.push({ $sort: { [sortBy]: sortOrder === 'asc' ? 1 : -1 } })

  pipeline.push({
    $facet: {
      data: [{ $skip: skip }, { $limit: limit }],
      meta: [{ $count: 'total' }]
    }
  })

  const aggregated = await Availability.aggregate(pipeline)

  const data = aggregated?.[0]?.data || []
  const total = aggregated?.[0]?.meta?.[0]?.total || 0

  return {
    data,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1
    }
  }
}

const getAvailabilityById = async (id: string) => {
  const result = await Availability.findById(id)

  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, "Availability not found")
  }

  return result
}

const deleteAvailabilityById = async (id: string) => {
  const result = await Availability.findOneAndDelete({ _id: id })

  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, "Availability not found")
  }

  return result
}

export const availabilityServices = {
  createAvailability,
  updateAvailability,
  getAllAvailability,
  getAvailabilityById,
  deleteAvailabilityById
}