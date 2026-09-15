import {
  ArtistBlockedDate,
  artistBlockedDateSearchableFields,
  AuthRoles,
  type IUser,
} from '@repo/db'
import httpStatus from 'http-status'
import { AppError, DATE_ONLY_FORMAT, toDateOnly } from '@repo/shared'
import { Types, type PipelineStage } from 'mongoose'
import moment from 'moment-timezone'

import type {
  TCreateArtistBlockedDatePayloadType,
  TUpdateArtistBlockedDatePayloadType,
  TGetAllArtistBlockedDateQueryParamsType,
} from './artist-blocked-date.validations'

const getTodayDateOnly = () => moment.tz('Australia/Sydney').format(DATE_ONLY_FORMAT)

const isPastBlockedDate = (date: string) => date < getTodayDateOnly()

const assertBlockedDateIsUpcoming = (date: string, action: 'updated' | 'deleted') => {
  if (isPastBlockedDate(date)) {
    throw new AppError(httpStatus.BAD_REQUEST, `A past blocked date cannot be ${action}`)
  }
}

const normalizeBlockedDates = (payload: TCreateArtistBlockedDatePayloadType) => {
  const dates = [...(payload.dates ?? []), ...(payload.date ? [payload.date] : [])]
    .map((date) => toDateOnly(date))
    .sort()

  return [...new Set(dates)]
}

const createArtistBlockedDate = async (
  user: IUser,
  payload: TCreateArtistBlockedDatePayloadType
) => {
  const dates = normalizeBlockedDates(payload)

  if (!dates.length) {
    throw new AppError(httpStatus.BAD_REQUEST, 'At least one date is required')
  }

  const today = getTodayDateOnly()
  const pastDates = dates.filter((date) => date < today)

  if (pastDates.length) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `Cannot block past dates: ${pastDates.join(', ')}`
    )
  }

  const existingDates = await ArtistBlockedDate.find({
    user: user._id,
    date: { $in: dates },
  }).distinct('date')

  if (existingDates.length) {
    throw new AppError(
      httpStatus.CONFLICT,
      `These dates are already blocked: ${existingDates.join(', ')}`
    )
  }

  const result = await ArtistBlockedDate.insertMany(
    dates.map((date) => ({
      user: user._id,
      date,
      reason: payload.reason,
      note: payload.note,
    }))
  )

  return result.length === 1 ? result[0] : result
}

const updateArtistBlockedDate = async (
  user: IUser,
  id: string,
  payload: TUpdateArtistBlockedDatePayloadType
) => {
  const existing = await ArtistBlockedDate.findById(id)

  if (!existing) {
    throw new AppError(httpStatus.NOT_FOUND, 'Artist blocked date not found')
  }

  if (user.role === AuthRoles.ARTIST && String(existing.user) !== String(user._id)) {
    throw new AppError(httpStatus.FORBIDDEN, 'You cannot update another artist blocked date')
  }

  assertBlockedDateIsUpcoming(existing.date, 'updated')

  const nextDate = payload.date ? toDateOnly(payload.date) : existing.date

  if (payload.date) {
    if (isPastBlockedDate(nextDate)) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Cannot block a past date')
    }

    const duplicate = await ArtistBlockedDate.findOne({
      user: existing.user,
      date: nextDate,
      _id: { $ne: existing._id },
    })

    if (duplicate) {
      throw new AppError(httpStatus.CONFLICT, `This date is already blocked: ${nextDate}`)
    }
  }

  const result = await ArtistBlockedDate.findOneAndUpdate(
    { _id: id },
    {
      $set: {
        ...payload,
        date: nextDate,
      },
    },
    { new: true }
  )

  return result
}

const getAllArtistBlockedDate = async (query: TGetAllArtistBlockedDateQueryParamsType) => {
  const {
    page = 1,
    limit = 10,
    searchTerm,
    sortOrder = 'desc',
    sortBy = 'date',
    fromDate,
    toDate,
    user,
    reason,
    skipPagination,
  } = query

  const skip = (page - 1) * limit
  const pipeline: PipelineStage[] = []
  const isPaginationSkipped =
    typeof skipPagination === 'string'
      ? skipPagination === 'true'
      : Boolean(skipPagination)

  if (user) {
    pipeline.push({ $match: { user: new Types.ObjectId(user) } })
  }

  if (reason) {
    pipeline.push({ $match: { reason } })
  }

  if (fromDate || toDate) {
    const dateFilter: Record<string, unknown> = {}
    if (fromDate) dateFilter.$gte = toDateOnly(fromDate)
    if (toDate) dateFilter.$lte = toDateOnly(toDate)

    pipeline.push({ $match: { date: dateFilter } })
  }

  if (searchTerm) {
    pipeline.push({
      $match: {
        $or: artistBlockedDateSearchableFields.map((field) => ({
          [field]: { $regex: searchTerm, $options: 'i' },
        })),
      },
    })
  }

  pipeline.push({ $sort: { [sortBy]: sortOrder === 'asc' ? 1 : -1 } })

  pipeline.push({
    $facet: {
      data: isPaginationSkipped ? [] : [{ $skip: skip }, { $limit: limit }],
      meta: [{ $count: 'total' }],
    },
  })

  const aggregated = await ArtistBlockedDate.aggregate(pipeline)

  const data = aggregated?.[0]?.data || []
  const total = aggregated?.[0]?.meta?.[0]?.total || 0

  return {
    data,
    meta: {
      page: isPaginationSkipped ? 1 : page,
      limit: isPaginationSkipped ? total : limit,
      total,
      totalPages: isPaginationSkipped ? 1 : Math.ceil(total / limit) || 1,
    },
  }
}

const getArtistBlockedDateById = async (id: string) => {
  const result = await ArtistBlockedDate.findById(id)

  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, 'Artist blocked date not found')
  }

  return result
}

const deleteArtistBlockedDateById = async (user: IUser, id: string) => {
  const existing = await ArtistBlockedDate.findById(id)

  if (!existing) {
    throw new AppError(httpStatus.NOT_FOUND, 'Artist blocked date not found')
  }

  if (user.role === AuthRoles.ARTIST && String(existing.user) !== String(user._id)) {
    throw new AppError(httpStatus.FORBIDDEN, 'You cannot delete another artist blocked date')
  }

  assertBlockedDateIsUpcoming(existing.date, 'deleted')

  await existing.deleteOne()

  return existing
}

export const artistBlockedDateServices = {
  createArtistBlockedDate,
  updateArtistBlockedDate,
  getAllArtistBlockedDate,
  getArtistBlockedDateById,
  deleteArtistBlockedDateById,
}
