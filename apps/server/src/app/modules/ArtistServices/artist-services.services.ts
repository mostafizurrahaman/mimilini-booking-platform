import {
  ArtistServices,
  artistServicesSearchableFields,
  artistServicesSortableFields,
  Category,
  type IUserDoc,
} from '@repo/db'
import httpStatus from 'http-status'
import { AppError } from '@repo/shared'
import { Types, type PipelineStage } from 'mongoose'

import type {
  TCreateArtistServicesPayloadType,
  TUpdateArtistServicesPayloadType,
  TGetAllArtistServicesQueryParamsType,
  TGetAllActiveArtistServicesQueryParamsType,
  TGetMyAllServicesQueryParamsType,
} from './artist-services.validations'
import { formatQuery, getSlug } from '@app/libs'

const createArtistServices = async (user: IUserDoc, payload: TCreateArtistServicesPayloadType) => {
  const { category, name, durationMinutes, price, isActive, description } = payload

  // ?? Check is category exists?:
  const existingCategory = await Category.findOne({
    _id: category,
  })

  if (!existingCategory) {
    throw new AppError(httpStatus.NOT_FOUND, 'Category not found.')
  }

  if (!existingCategory.isActive) {
    throw new AppError(httpStatus.NOT_FOUND, 'This category is not active.')
  }

  // Create slug:
  const slug = getSlug(name)

  // Check is slug already exists:
  const duplicateSlug = await ArtistServices.findOneAndDelete({
    artist: user?._id,
    category: existingCategory._id,
    slug,
  })

  if (duplicateSlug) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'This artist already has a service for the selected category with same name.'
    )
  }

  const result = await ArtistServices.create({
    artist: user?._id,
    category: existingCategory._id,
    name,
    slug,
    description: description!,
    durationMinutes,
    price,
    isActive: isActive as boolean,
  })
  return result
}

const updateArtistServices = async (
  user: IUserDoc,
  id: string,
  payload: TUpdateArtistServicesPayloadType
) => {
  // Check is Services exists:
  const service = await ArtistServices.findById(id)
  if (!service) {
    throw new AppError(httpStatus.NOT_FOUND, 'Service not found.')
  }

  let category = service.category

  if (
    payload.category !== undefined &&
    service.category?.toString() !== payload?.category?.toString()
  ) {
    const newCategory = await Category.findById(payload.category)
    if (!newCategory) {
      throw new AppError(httpStatus.NOT_FOUND, 'Category not found.')
    }

    category = newCategory._id
  }

  let slug = service.slug
  if (payload.name !== undefined && payload.name?.trim() !== service.name?.trim()) {
    const newSlug = getSlug(payload.name)

    const duplicateSlug = await ArtistServices.findOne({
      _id: {
        $ne: service?._id,
      },
      artist: user?._id,
      category,
      slug: newSlug,
    })

    if (duplicateSlug) {
      throw new AppError(
        httpStatus.CONFLICT,
        'This artist already has a service for the selected category with same name.'
      )
    }
    slug = newSlug
  }

  const updatedData = Object.fromEntries(
    Object.entries(payload).filter((data) => data?.[1] !== undefined)
  )

  if (slug) {
    updatedData.slug = slug
  }

  if (category) {
    updatedData.category = category as unknown as string
  }

  const result = await ArtistServices.findOneAndUpdate(
    { _id: id },
    { $set: updatedData },
    { new: true }
  )

  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, 'ArtistServices not found')
  }

  return result
}

const toggleFeatured = async (user: IUserDoc, id: string) => {
  // Check is Services exists:
  const service = await ArtistServices.findById(id)
  if (!service) {
    throw new AppError(httpStatus.NOT_FOUND, 'Service not found.')
  }

  if (user._id?.toString() !== service.artist?.toString()) {
    throw new AppError(httpStatus.FORBIDDEN, `This service doesn't belong to your account.`)
  }

  service.isFeatured = !service.isFeatured

  await service.save()

  return {
    message: service.isFeatured
      ? 'Service has been added to featured'
      : 'Service has been removed from featured.',
  }
}

const togglePopular = async (user: IUserDoc, id: string) => {
  // Check is Services exists:
  const service = await ArtistServices.findById(id)
  if (!service) {
    throw new AppError(httpStatus.NOT_FOUND, 'Service not found.')
  }

  if (user._id?.toString() !== service.artist?.toString()) {
    throw new AppError(httpStatus.FORBIDDEN, `This service doesn't belong to your account.`)
  }

  service.isPopular = !service.isPopular

  await service.save()

  return {
    message: service.isPopular
      ? 'Service has been added to popular'
      : 'Service has been removed from popular.',
  }
}

const getAllArtistServices = async (query: TGetAllArtistServicesQueryParamsType) => {
  const { isFeatured, isActive, isPopular, artist, category } = query
  const {
    page = 1,
    limit = 10,
    searchTerm,
    sortOrder,
    sortBy,
    fromDate,
    toDate,
  } = formatQuery(query, artistServicesSortableFields)

  const skip = (page - 1) * limit
  const pipeline: PipelineStage[] = []

  const matchStage: PipelineStage.Match = {
    $match: {},
  }

  if (isActive !== undefined) {
    matchStage.$match['isActive'] = isActive
  }
  if (isPopular !== undefined) {
    matchStage.$match['isPopular'] = isPopular
  }
  if (isFeatured !== undefined) {
    matchStage.$match['isFeatured'] = isFeatured
  }

  if (artist !== undefined) {
    matchStage.$match['artist'] = new Types.ObjectId(artist)
  }

  if (category !== undefined) {
    matchStage.$match['category'] = new Types.ObjectId(category)
  }

  pipeline.push(matchStage)

  if (fromDate || toDate) {
    const dateFilter: Record<string, unknown> = {}
    if (fromDate) dateFilter.$gte = new Date(fromDate)
    if (toDate) dateFilter.$lte = new Date(toDate)

    pipeline.push({ $match: { createdAt: dateFilter } })
  }

  pipeline.push(
    {
      $lookup: {
        from: 'categories',
        localField: 'category',
        foreignField: '_id',
        as: 'categoryDetails',
      },
    },
    {
      $lookup: {
        from: 'users',
        localField: 'artist',
        foreignField: '_id',
        as: 'artistDetails',
      },
    },
    {
      $unwind: {
        path: '$categoryDetails',
        preserveNullAndEmptyArrays: true,
      },
    },

    {
      $unwind: {
        path: '$artistDetails',
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $project: {
        _id: 0,
        serviceId: '$_id',
        artist: '$artist',
        category: '$category',
        categoryName: { $ifNull: ['$categoryDetails.name', null] },
        artistName: { $ifNull: ['$artistDetails.name', null] },
        artistEmail: { $ifNull: ['$artistDetails.email', null] },
        artistPhone: { $ifNull: ['$artistDetails.phone', null] },
        name: '$name',
        slug: '$slug',
        description: { $ifNull: ['$description', null] },
        durationMinutes: '$durationMinutes',
        price: '$price',
        isFeatured: { $ifNull: ['$isFeatured', false] },
        isPopular: { $ifNull: ['$isPopular', false] },
        isActive: { $ifNull: ['$isActive', false] },
        createdAt: '$createdAt',
        updatedAt: '$updatedAt',
      },
    }
  )

  if (searchTerm) {
    pipeline.push({
      $match: {
        $or: artistServicesSearchableFields.map((field) => ({
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

  const aggregated = await ArtistServices.aggregate(pipeline)

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

const getAllActiveArtistServices = (query: TGetAllActiveArtistServicesQueryParamsType) => {
  return getAllArtistServices({
    ...query,
    isActive: true,
  })
}

const getMyArtistServices = (user: IUserDoc, query: TGetMyAllServicesQueryParamsType) => {
  return getAllArtistServices({
    ...query,
    artist: user?._id?.toString(),
  })
}

const getArtistServicesById = async (id: string) => {
  const result = await ArtistServices.findById(id)

  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, 'Service not found')
  }

  return result
}

const deleteArtistServicesById = async (id: string) => {
  const result = await ArtistServices.findOneAndDelete({ _id: id })

  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, 'ArtistServices not found')
  }

  return result
}

export const artistServicesServices = {
  createArtistServices,
  updateArtistServices,
  getAllArtistServices,
  getAllActiveArtistServices,
  getMyArtistServices,
  getArtistServicesById,
  deleteArtistServicesById,
  togglePopular,
  toggleFeatured,
}
