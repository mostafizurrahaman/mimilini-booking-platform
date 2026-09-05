import { Category, categorySearchableFields, categorySortableFields, type IUser } from '@repo/db'
import httpStatus from 'http-status'
import { AppError } from '@repo/shared'
import type { PipelineStage } from 'mongoose'

import type {
  TCreateCategoryPayloadType,
  TUpdateCategoryPayloadType,
  TGetAllCategoryQueryParamsType,
} from './category.validations'
import { formatQuery, getSlug } from '@app/libs'

// 1. Create category
const createCategory = async (user: IUser, payload: TCreateCategoryPayloadType) => {
  const { name, description, isActive } = payload

  // ?? generate the slug:
  const slug = getSlug(name)

  // ?? Check any category already exists with this slug?:
  const existingCategory = await Category.findOne({
    slug,
  })

  if (existingCategory) {
    throw new AppError(httpStatus.CONFLICT, 'You have already a category with this slug.')
  }

  const newPayload = {
    name,
    description: description!,
    slug,
    createdBy: user?._id,
    isActive,
  }

  const result = await Category.create(newPayload)
  return result
}

// 2. Update category
const updateCategory = async (id: string, payload: TUpdateCategoryPayloadType) => {
  const { name, description, isActive } = payload

  // ?? Check is category exists?:
  const existingCategory = await Category.findById(id)
  if (!existingCategory) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Category not found')
  }

  if (name !== undefined) {
    const slug = getSlug(name)

    // ?? Check duplicate category:
    const hasAnyAssociatedCategoryWithName = await Category.findOne({
      _id: {
        $ne: existingCategory?._id,
      },
      slug,
    })

    if (hasAnyAssociatedCategoryWithName) {
      throw new AppError(
        httpStatus.CONFLICT,
        'Another one category exists with the same name and slug.'
      )
    }

    existingCategory.name = name
    existingCategory.slug = slug
  }

  if (description !== undefined) existingCategory.description = description
  if (isActive !== undefined) existingCategory.isActive = isActive

  await existingCategory.save()

  return existingCategory
}

// 3. Get all categories:
const getAllCategory = async (query: TGetAllCategoryQueryParamsType) => {
  const { isActive, ...rest } = query
  const { page, limit, searchTerm, fromDate, toDate, skip, sortBy, sortOrder } = formatQuery(
    rest,
    categorySortableFields
  )

  // ?? Format limit and pagination
  const pipeline: PipelineStage[] = []

  if (fromDate || toDate) {
    const dateFilter: Record<string, unknown> = {}
    if (fromDate) dateFilter.$gte = new Date(fromDate)
    if (toDate) dateFilter.$lte = new Date(toDate)

    pipeline.push({ $match: { createdAt: dateFilter } })
  }

  if (isActive !== undefined) {
    const activeValue = typeof isActive === 'string' ? isActive === 'true' : isActive
    pipeline.push({
      $match: {
        isActive: activeValue,
      },
    })
  }

  if (searchTerm) {
    pipeline.push({
      $match: {
        $or: categorySearchableFields.map((field) => ({
          [field]: { $regex: searchTerm, $options: 'i' },
        })),
      },
    })
  }

  pipeline.push(
    {
      $lookup: {
        from: 'users',
        localField: 'createdBy',
        foreignField: '_id',
        as: 'userDetails',
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
      createdById: '$userDetails._id',
      createdByEmail: '$userDetails.email',
      createdByName: '$userDetails.name',
    },
  })

  pipeline.push({
    $project: {
      userDetails: 0,
    },
  })

  pipeline.push({ $sort: { [sortBy]: sortOrder } })

  pipeline.push({
    $facet: {
      data: [{ $skip: skip }, { $limit: limit }],
      meta: [{ $count: 'total' }],
    },
  })

  const aggregated = await Category.aggregate(pipeline)

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

// 4. Get category by id:
const getCategoryById = async (id: string) => {
  const result = await Category.findById(id)

  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, 'Category not found')
  }

  return result
}

const deleteCategoryById = async (id: string) => {
  const result = await Category.findOneAndDelete({ _id: id })

  // ?? Todo: Has to check is this category used any where else:

  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, 'Category not found')
  }

  return result
}

export const categoryServices = {
  createCategory,
  updateCategory,
  getAllCategory,
  getCategoryById,
  deleteCategoryById,
}
