import { ArtistBlockedDate, artistBlockedDateSearchableFields  } from "@repo/db"
import httpStatus from "http-status"
import { AppError } from "@repo/shared"
import type { PipelineStage } from "mongoose"

import type {
  TCreateArtistBlockedDatePayloadType,
  TUpdateArtistBlockedDatePayloadType,
  TGetAllArtistBlockedDateQueryParamsType
} from "./artist-blocked-date.validations"

const createArtistBlockedDate = async (payload: TCreateArtistBlockedDatePayloadType) => {
  const result = await ArtistBlockedDate.create(payload)
  return result
}

const updateArtistBlockedDate = async (id: string, payload: TUpdateArtistBlockedDatePayloadType) => {
  const result = await ArtistBlockedDate.findOneAndUpdate(
    { _id: id },
    { $set: payload },
    { new: true }
  )

  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, "ArtistBlockedDate not found")
  }

  return result
}

const getAllArtistBlockedDate = async (query: TGetAllArtistBlockedDateQueryParamsType) => {
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
        $or: artistBlockedDateSearchableFields.map(field => ({
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

  const aggregated = await ArtistBlockedDate.aggregate(pipeline)

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

const getArtistBlockedDateById = async (id: string) => {
  const result = await ArtistBlockedDate.findById(id)

  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, "ArtistBlockedDate not found")
  }

  return result
}

const deleteArtistBlockedDateById = async (id: string) => {
  const result = await ArtistBlockedDate.findOneAndDelete({ _id: id })

  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, "ArtistBlockedDate not found")
  }

  return result
}

export const artistBlockedDateServices = {
  createArtistBlockedDate,
  updateArtistBlockedDate,
  getAllArtistBlockedDate,
  getArtistBlockedDateById,
  deleteArtistBlockedDateById
}