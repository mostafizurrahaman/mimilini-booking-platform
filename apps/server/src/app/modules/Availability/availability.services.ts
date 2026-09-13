import {
  Availability,
  availabilitySearchableFields,
  type IUser,
  type IWeeklySchedule,
  type TDay,
} from '@repo/db'
import httpStatus from 'http-status'
import { AppError, isValidTimeZone } from '@repo/shared'
import type { PipelineStage } from 'mongoose'

import type {
  TCreateAvailabilityPayloadType,
  TUpdateAvailabilityPayloadType,
  TGetAllAvailabilityQueryParamsType,
} from './availability.validations'
import moment from 'moment-timezone'

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

  // ?? format dates:
  const formattedVacationStartDate = isVacationEnabled
    ? moment.tz(vacationStartDate, timezone).startOf('day').toDate()
    : null
  const formattedVacationEndDate = isVacationEnabled
    ? moment.tz(vacationEndDate, timezone).startOf('day').toDate()
    : null

  const result = await Availability.create({
    user: user?._id,
    timezone,
    weeklySchedule: weeklySchedule as IWeeklySchedule,
    isVacationEnabled,
    vacationStartDate: formattedVacationStartDate,
    vacationEndDate: formattedVacationEndDate,
    vacationMessage: vacationMessage!,

    isQuickBookingEnabled,
    minNotice,
    maxBookingPerDay,
    bufferTime,

    repetitionType,
  })
  return result
}

const updateAvailability = async (user: IUser, payload: TUpdateAvailabilityPayloadType) => {
  const existingScheduled = await Availability.findOne({ user: user?._id })

  if (!existingScheduled) {
    throw new AppError(httpStatus.NOT_FOUND, 'Your schedule was not found.')
  }

  const {
    timezone,
    weeklySchedule,
    isVacationEnabled,
    vacationStartDate,
    vacationEndDate,
    vacationMessage,
    isQuickBookingEnabled,
    bufferTime,
    minNotice,
    maxBookingPerDay,
    repetitionType,
  } = payload

  // Timezone update
  if (timezone !== undefined) {
    if (!isValidTimeZone(timezone)) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Invalid timezone.')
    }
    existingScheduled.timezone = timezone
  }

  // Weekly Schedule update
  if (weeklySchedule) {
    const newWeeklySchedule = weeklySchedule as IWeeklySchedule
    const existingWeeklySchedule = existingScheduled.weeklySchedule as IWeeklySchedule
/*
     * TODO:
     * 1. When working hours are reduced (startTime/endTime changed to a smaller
     *    available time range), check whether any existing/future booking falls
     *    within the removed/skipped time. If a booking exists in that period,
     *    prevent the schedule update.
     *
     * 2. When break time is increased or moved, calculate the newly unavailable
     *    break period and check whether any existing/future booking overlaps
     *    with that period. If a booking exists during the newly added break time,
     *    prevent the schedule update.
     */
    for (const [day, schedule] of Object.entries(newWeeklySchedule)) {
      const dayKey = day as TDay
      const existingDay = existingWeeklySchedule?.[dayKey]

      if (schedule.isWorkingDay) {
        const startTime = schedule?.startTime ?? existingDay?.startTime
        const endTime = schedule?.endTime ?? existingDay?.endTime

        if (!startTime || !endTime) {
          throw new AppError(httpStatus.BAD_REQUEST, 'Both start time and end time are required.')
        }

        const stTime = moment(startTime, 'HH:mm', true)
        const edTime = moment(endTime, 'HH:mm', true)

        if (!stTime.isValid() || !edTime.isValid()) {
          throw new AppError(httpStatus.BAD_REQUEST, 'Invalid time format. Use HH:mm.')
        }

        if (edTime.isSameOrBefore(stTime)) {
          throw new AppError(httpStatus.BAD_REQUEST, 'End time must be after start time.')
        }

        // Break time handling
        const breakStartTime =
          schedule?.breakStartTime !== undefined
            ? schedule.breakStartTime
            : existingDay?.breakStartTime
        const breakEndTime =
          schedule?.breakEndTime !== undefined ? schedule.breakEndTime : existingDay?.breakEndTime

        const hasBreakStart = Boolean(breakStartTime)
        const hasBreakEnd = Boolean(breakEndTime)

        if (hasBreakStart !== hasBreakEnd) {
          throw new AppError(
            httpStatus.BAD_REQUEST,
            'Both break start time and break end time must be provided together.'
          )
        }

        if (breakStartTime && breakEndTime) {
          const breakStTime = moment(breakStartTime, 'HH:mm', true)
          const breakEdTime = moment(breakEndTime, 'HH:mm', true)

          if (!breakStTime.isValid() || !breakEdTime.isValid()) {
            throw new AppError(httpStatus.BAD_REQUEST, 'Invalid break time format. Use HH:mm.')
          }

          if (breakStTime.isBefore(stTime)) {
            throw new AppError(
              httpStatus.BAD_REQUEST,
              'Break start time must be at or after start time.'
            )
          }

          if (breakEdTime.isAfter(edTime)) {
            throw new AppError(
              httpStatus.BAD_REQUEST,
              'Break end time must be at or before end time.'
            )
          }

          if (breakEdTime.isSameOrBefore(breakStTime)) {
            throw new AppError(
              httpStatus.BAD_REQUEST,
              'Break end time must be after break start time.'
            )
          }
        }

        existingWeeklySchedule[dayKey] = {
          isWorkingDay: true,
          startTime,
          endTime,
          breakStartTime: breakStartTime ?? null,
          breakEndTime: breakEndTime ?? null,
        }
      } else {
        existingWeeklySchedule[dayKey] = {
          isWorkingDay: false,
          startTime: null,
          endTime: null,
          breakStartTime: null,
          breakEndTime: null,
        }
      }
    }

    existingScheduled.markModified('weeklySchedule')
  }

  // Vacation update
  const isFinalVacationEnabled =
    isVacationEnabled !== undefined ? isVacationEnabled : existingScheduled.isVacationEnabled

  if (isFinalVacationEnabled) {
    const vacationStDate =
      vacationStartDate !== undefined ? vacationStartDate : existingScheduled.vacationStartDate
    const vacationEdDate =
      vacationEndDate !== undefined ? vacationEndDate : existingScheduled.vacationEndDate

    if (!vacationStDate || !vacationEdDate) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Vacation start and end dates are required.')
    }

    const vStDate = moment.tz(vacationStDate, existingScheduled.timezone).startOf('day')
    const vEdDate = moment.tz(vacationEdDate, existingScheduled.timezone).startOf('day')

    if (vEdDate.isSameOrBefore(vStDate)) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'Vacation end date must be after vacation start date.'
      )
    }

    existingScheduled.isVacationEnabled = true
    existingScheduled.vacationStartDate = vStDate.toDate()
    existingScheduled.vacationEndDate = vEdDate.toDate()
    existingScheduled.vacationMessage =
      vacationMessage !== undefined ? vacationMessage as string : existingScheduled.vacationMessage as string
  } else {
    existingScheduled.isVacationEnabled = false
    existingScheduled.vacationStartDate = null
    existingScheduled.vacationEndDate = null
    existingScheduled.vacationMessage = undefined
  }

  // Other settings
  if (isQuickBookingEnabled !== undefined)
    existingScheduled.isQuickBookingEnabled = isQuickBookingEnabled
  if (bufferTime !== undefined) existingScheduled.bufferTime = bufferTime
  if (minNotice !== undefined) existingScheduled.minNotice = minNotice
  if (maxBookingPerDay !== undefined) existingScheduled.maxBookingPerDay = maxBookingPerDay
  if (repetitionType !== undefined) existingScheduled.repetitionType = repetitionType

  await existingScheduled.save({ validateBeforeSave: true })

  return existingScheduled
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
