import { ArtistProfile, artistProfileSearchableFields  } from "@repo/db"
import httpStatus from "http-status"
import { AppError } from "@repo/shared"
import type { PipelineStage } from "mongoose"

import type {
  TCreateArtistProfilePayloadType,
  TUpdateArtistProfilePayloadType,
  TGetAllArtistProfileQueryParamsType
} from "./artist-profile.validations"

const createArtistProfile = async (payload: TCreateArtistProfilePayloadType) => {
  const result = await ArtistProfile.create(payload)
  return result
}

const updateArtistProfile = async (id: string, payload: TUpdateArtistProfilePayloadType) => {
  const result = await ArtistProfile.findOneAndUpdate(
    { _id: id },
    { $set: payload },
    { new: true }
  )

  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, "ArtistProfile not found")
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
        $or: artistProfileSearchableFields.map(field => ({
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

  const aggregated = await ArtistProfile.aggregate(pipeline)

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

const getArtistProfileById = async (id: string) => {
  const result = await ArtistProfile.findById(id)

  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, "ArtistProfile not found")
  }

  return result
}

const deleteArtistProfileById = async (id: string) => {
  const result = await ArtistProfile.findOneAndDelete({ _id: id })

  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, "ArtistProfile not found")
  }

  return result
}

export const artistProfileServices = {
  createArtistProfile,
  updateArtistProfile,
  getAllArtistProfile,
  getArtistProfileById,
  deleteArtistProfileById
}