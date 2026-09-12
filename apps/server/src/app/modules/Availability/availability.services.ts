import {
  Availability,
  availabilitySearchableFields,
  type IUser,
  type IWeeklySchedule,
} from '@repo/db'
import httpStatus from 'http-status'
import { AppError, isValidTimeZone } from '@repo/shared'
import type { PipelineStage } from 'mongoose'

import type {
  TCreateAvailabilityPayloadType,
  TUpdateAvailabilityPayloadType,
  TGetAllAvailabilityQueryParamsType,
} from './availability.validations'

const createAvailability = async (user: IUser, payload: TCreateAvailabilityPayloadType) => {
  const {
    timezone,

    // ?? Weekly Scheduled:
    weeklySchedule,

    // ?? Vacation :
    isVacationEnabled,
    vacationStartDate,
    vacationEndDate,
    vacationMessage,

    // ?? Quick Booking Settings :
    isQuickBookingEnabled,
    minNotice,
    maxBookingPerDay,
    bufferTime,

    // ?? Repetition type:
    repetitionType,
  } = payload

  // ?? 1. Check is any availability schedule already exists for this user?:
  const existingAvailability = await Availability.findOne({
    user: user?._id,
  })
  if (existingAvailability) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Your availability scheduled has already been updated.'
    )
  }

  // ?? 2. Check is time zone is valid? :
  if (!isValidTimeZone(timezone)) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Invalid timezone.')
  }

  const result = await Availability.create({
    user: user?._id,
    timezone,
    weeklySchedule: weeklySchedule as IWeeklySchedule,
    isVacationEnabled,
    vacationStartDate: vacationStartDate!,
    vacationEndDate: vacationEndDate!,
    vacationMessage: vacationMessage!,

    isQuickBookingEnabled,
    minNotice,
    maxBookingPerDay,
    bufferTime,

    repetitionType,
  })
  return result
}

const updateAvailability = async (id: string, payload: TUpdateAvailabilityPayloadType) => {
  const result = await Availability.findOneAndUpdate({ _id: id }, { $set: payload }, { new: true })

  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, 'Availability not found')
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
        $or: availabilitySearchableFields.map((field) => ({
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

  const aggregated = await Availability.aggregate(pipeline)

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

const getAvailabilityByUserId = async (user: IUser) => {
  const result = await Availability.findOne({
    user: user?._id,
  })

  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, `You have not setup scheduled yet.`)
  }

  return result
}

const deleteAvailabilityById = async (id: string) => {
  const result = await Availability.findOneAndDelete({ _id: id })

  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, 'Availability not found')
  }

  return result
}

export const availabilityServices = {
  createAvailability,
  updateAvailability,
  getAllAvailability,
  getAvailabilityByUserId,
  deleteAvailabilityById,
}
