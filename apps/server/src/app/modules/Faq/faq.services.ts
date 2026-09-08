import { Faq, faqSearchableFields, faqSortableFields } from '@repo/db'
import httpStatus from 'http-status'
import { AppError } from '@repo/shared'
import type { PipelineStage } from 'mongoose'

import type {
  TCreateFaqPayloadType,
  TUpdateFaqPayloadType,
  TGetAllFaqQueryParamsType,
} from './faq.validations'
import { formatQuery, getSlug } from '@app/libs'

const createFaq = async (payload: TCreateFaqPayloadType) => {
  const { question, answer } = payload

  // ?? Generate the slug:
  const slug = getSlug(question)

  // ?? Check any faq exists with this slug:
  const existingFaq = await Faq.findOne({
    slug,
  })

  if (existingFaq) {
    throw new AppError(httpStatus.BAD_REQUEST, 'The faq question already exists.')
  }

  const result = await Faq.create({
    question,
    slug,
    answer,
  })

  return result
}

const updateFaq = async (id: string, payload: TUpdateFaqPayloadType) => {
  // ?? check is existing payload:
  const existingFaq = await Faq.findById(id)
  if (!existingFaq) {
    throw new AppError(httpStatus.NOT_FOUND, 'Faq not found')
  }

  const { question, answer } = payload

  if (question !== undefined) {
    const slug = getSlug(question)
    const duplicateFaq = await Faq.findOne({
      _id: {
        $ne: existingFaq._id,
      },
      slug,
    })

    if (duplicateFaq) {
      throw new AppError(httpStatus.NOT_FOUND, 'The same faq question already exist.')
    }
    existingFaq.question = question
    existingFaq.slug = slug
  }

  if (answer !== undefined) existingFaq.answer = answer

  await existingFaq.save()

  return existingFaq
}

const getAllFaq = async (query: TGetAllFaqQueryParamsType) => {
  const { page, limit, searchTerm, sortOrder, sortBy, fromDate, toDate } = formatQuery(
    query,
    faqSortableFields
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
        $or: faqSearchableFields.map((field) => ({
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

  const aggregated = await Faq.aggregate(pipeline)

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

const getFaqById = async (id: string) => {
  const result = await Faq.findById(id)

  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, 'Faq not found')
  }

  return result
}

const deleteFaqById = async (id: string) => {
  const result = await Faq.findOneAndDelete({ _id: id })

  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, 'Faq not found')
  }

  return result
}

export const faqServices = {
  createFaq,
  updateFaq,
  getAllFaq,
  getFaqById,
  deleteFaqById,
}
