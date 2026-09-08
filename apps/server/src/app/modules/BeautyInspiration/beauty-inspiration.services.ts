import {
  BeautyInspiration,
  beautyInspirationSearchableFields,
  beautyInspirationSortableFields,
} from '@repo/db'
import httpStatus from 'http-status'
import { AppError } from '@repo/shared'
import type { PipelineStage } from 'mongoose'

import type {
  TCreateBeautyInspirationPayloadType,
  TUpdateBeautyInspirationPayloadType,
  TGetAllBeautyInspirationQueryParamsType,
} from './beauty-inspiration.validations'
import {
  deleteSingleFileFromS3,
  uploadSingleFileToS3,
  type TMulterFile,
} from 'packages/media-hub/src'
import { AWS_FOLDER_NAMES, formatQuery } from '@app/libs'

/**
 * Deduplicates and normalizes tags by trimming whitespace.
 * Preserves the original casing of the first occurrence while enforcing case-insensitive uniqueness.
 */
const normalizeUniqueTags = (tags: string[]): string[] => {
  const seen = new Set<string>()
  const uniqueTags: string[] = []

  for (const rawTag of tags) {
    const trimmed = rawTag.trim()
    const lower = trimmed.toLowerCase()

    if (trimmed && !seen.has(lower)) {
      seen.add(lower)
      uniqueTags.push(trimmed)
    }
  }

  return uniqueTags
}

const createBeautyInspiration = async (
  payload: TCreateBeautyInspirationPayloadType,
  image?: TMulterFile
) => {
  if (!image) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Inspiration image is required.')
  }

  const { tags } = payload
  if (!tags || tags.length === 0) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Min. one tag is required.')
  }

  const cleanTags = normalizeUniqueTags(tags)
  if (cleanTags.length === 0) {
    throw new AppError(httpStatus.BAD_REQUEST, 'At least one valid non-empty tag is required.')
  }

  const { url } = await uploadSingleFileToS3(image, AWS_FOLDER_NAMES.BannerInspiration)

  const result = await BeautyInspiration.create({
    url,
    tags: cleanTags,
  })

  return result
}

const updateBeautyInspiration = async (
  id: string,
  payload: TUpdateBeautyInspirationPayloadType,
  image?: TMulterFile
) => {
  const existingInspiration = await BeautyInspiration.findById(id)
  if (!existingInspiration) {
    throw new AppError(httpStatus.NOT_FOUND, 'BeautyInspiration not found')
  }

  const updateDoc: Record<string, unknown> = {}

  if (payload.tags) {
    const cleanTags = normalizeUniqueTags(payload.tags)
    if (cleanTags.length === 0) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Tags cannot be empty.')
    }
    updateDoc.tags = cleanTags
  }

  const oldUrl: string | undefined = existingInspiration.url
  let newUrl: string | undefined = undefined

  if (image) {
    const { url } = await uploadSingleFileToS3(image, AWS_FOLDER_NAMES.BannerInspiration)
    updateDoc.url = url
    newUrl = url
  }

  if (Object.keys(updateDoc).length === 0) {
    return existingInspiration
  }

  const result = await BeautyInspiration.findByIdAndUpdate(
    id,
    { $set: updateDoc },
    { new: true, runValidators: true }
  )

  if (oldUrl && newUrl) {
    await deleteSingleFileFromS3(oldUrl)
  }

  return result
}

const getAllBeautyInspiration = async (query: TGetAllBeautyInspirationQueryParamsType) => {
  const { page, limit, searchTerm, sortOrder, sortBy, fromDate, toDate } = formatQuery(
    query,
    beautyInspirationSortableFields
  )

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
        $or: beautyInspirationSearchableFields.map((field) => ({
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

  const aggregated = await BeautyInspiration.aggregate(pipeline)

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

const getBeautyInspirationById = async (id: string) => {
  const result = await BeautyInspiration.findById(id)

  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, 'BeautyInspiration not found')
  }

  return result
}

const deleteBeautyInspirationById = async (id: string) => {
  const result = await BeautyInspiration.findOneAndDelete({ _id: id })

  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, 'BeautyInspiration not found')
  }

  if (result.url) {
    deleteSingleFileFromS3(result.url).catch((err) => console.log(err))
  }

  return result
}

export const beautyInspirationServices = {
  createBeautyInspiration,
  updateBeautyInspiration,
  getAllBeautyInspiration,
  getBeautyInspirationById,
  deleteBeautyInspirationById,
}
