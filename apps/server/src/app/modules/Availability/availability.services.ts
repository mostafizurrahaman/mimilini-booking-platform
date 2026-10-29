import {
  Availability,
  availabilitySearchableFields,
  Booking,
  BOOKING_STATUS,
  ArtistBlockedDate,
  ArtistProfile,
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
import {
  getBreakTimesValidationError,
  normalizeBreakTimes,
  normalizeWorkingDay,
} from './availability.utils'

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

  const normalizedWeeklySchedule = Object.fromEntries(
    Object.entries(weeklySchedule).map(([day, schedule]) => {
      const normalizedDay = normalizeWorkingDay({
        isWorkingDay: schedule.isWorkingDay,
        startTime: schedule.startTime,
        endTime: schedule.endTime,
        breakTimes: schedule.breakTimes,
      })

      if (normalizedDay.isWorkingDay && normalizedDay.startTime && normalizedDay.endTime) {
        const breakTimesError = getBreakTimesValidationError(
          normalizedDay.breakTimes,
          normalizedDay.startTime,
          normalizedDay.endTime
        )

        if (breakTimesError) {
          throw new AppError(httpStatus.BAD_REQUEST, breakTimesError)
        }
      }

      return [day, normalizedDay]
    })
  ) as IWeeklySchedule

  const result = await Availability.create({
    user: user?._id,
    timezone,
    weeklySchedule: normalizedWeeklySchedule,
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
    const newWeeklySchedule = weeklySchedule
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
      if (!schedule) continue

      const dayKey = day as TDay
      const existingDay = existingWeeklySchedule?.[dayKey]
      const isWorkingDay = schedule.isWorkingDay ?? existingDay?.isWorkingDay ?? false

      if (!isWorkingDay) {
        existingWeeklySchedule[dayKey] = normalizeWorkingDay({
          isWorkingDay: false,
        })
        continue
      }

      const startTime =
        schedule.startTime !== undefined ? schedule.startTime : existingDay?.startTime
      const endTime = schedule.endTime !== undefined ? schedule.endTime : existingDay?.endTime

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

      const breakTimes =
        schedule.breakTimes !== undefined
          ? normalizeBreakTimes(schedule.breakTimes)
          : (existingDay?.breakTimes ?? [])

      const breakTimesError = getBreakTimesValidationError(breakTimes, startTime, endTime)
      if (breakTimesError) {
        throw new AppError(httpStatus.BAD_REQUEST, breakTimesError)
      }

      existingWeeklySchedule[dayKey] = normalizeWorkingDay({
        isWorkingDay: true,
        startTime,
        endTime,
        breakTimes,
      })
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
      vacationMessage !== undefined
        ? (vacationMessage as string)
        : (existingScheduled.vacationMessage as string)
  } else {
    existingScheduled.isVacationEnabled = false
    existingScheduled.vacationStartDate = null
    existingScheduled.vacationEndDate = null
    existingScheduled.vacationMessage = null
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

const CALENDAR_LEGEND = [
  { status: 'available', label: 'Available', color: '#10B981' },
  { status: 'booked', label: 'Booked', color: '#F43F5E' },
  { status: 'blocked', label: 'Blocked', color: '#94A3B8' },
  { status: 'vacation', label: 'Vacation', color: '#F59E0B' },
  { status: 'today', label: 'Today', color: '#F43F5E' },
] as const

const getArtistAvailableDaysInMonth = async (artistId: string, monthStr?: string) => {
  const targetMoment = monthStr ? moment(monthStr, 'YYYY-MM') : moment()
  if (!targetMoment.isValid()) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Invalid month format, expected YYYY-MM')
  }

  // Resolve artist user ID (supports both User._id and ArtistProfile._id)
  let artistUserId = artistId
  const artistProfile = await ArtistProfile.findOne({
    $or: [
      { user: artistId },
      ...(artistId.match(/^[0-9a-fA-F]{24}$/) ? [{ _id: artistId }] : []),
    ],
  })
  if (artistProfile) {
    artistUserId = artistProfile.user.toString()
  }

  const availability = await Availability.findOne({ user: artistUserId })
  if (!availability) {
    throw new AppError(httpStatus.NOT_FOUND, 'Artist has not set up availability schedule.')
  }

  const daysInMonth = targetMoment.daysInMonth()
  const startOfMonthStr = targetMoment.clone().startOf('month').format('YYYY-MM-DD')
  const endOfMonthStr = targetMoment.clone().endOf('month').format('YYYY-MM-DD')
  const startOfMonthDate = targetMoment.clone().startOf('month').toDate()
  const endOfMonthDate = targetMoment.clone().endOf('month').toDate()

  // 1. Fetch all blocked dates in this month
  const blockedDates = await ArtistBlockedDate.find({
    user: artistUserId,
    date: { $gte: startOfMonthStr, $lte: endOfMonthStr },
  }).lean()
  const blockedDatesMap = new Map<string, (typeof blockedDates)[number]>(
    blockedDates.map((b) => [b.date, b])
  )

  // 2. Fetch all active bookings in this month
  const monthBookings = await Booking.find({
    artist: artistUserId,
    bookingDate: { $gte: startOfMonthDate, $lte: endOfMonthDate },
    status: {
      $nin: [
        BOOKING_STATUS.CANCELLED,
        BOOKING_STATUS.DECLINED,
      ],
    },
  })
    .select('bookingDate startTime endTime status')
    .lean()

  const bookingsByDate: Record<string, typeof monthBookings> = {}
  for (const bkg of monthBookings) {
    const dStr = moment(bkg.bookingDate).format('YYYY-MM-DD')
    if (!bookingsByDate[dStr]) bookingsByDate[dStr] = []
    bookingsByDate[dStr].push(bkg)
  }

  const todayStr = moment().format('YYYY-MM-DD')
  const dayNameMapping: Record<number, string> = {
    0: 'sunday',
    1: 'monday',
    2: 'tuesday',
    3: 'wednesday',
    4: 'thursday',
    5: 'friday',
    6: 'saturday',
  }

  const isPenalized = Boolean(artistProfile?.isPenaltyRequired)
  const daysResult = []
  const availableDates: string[] = []
  let availableCount = 0
  let bookedCount = 0
  let blockedCount = 0
  let vacationCount = 0
  let offCount = 0

  const buffer = availability.bufferTime || 0
  const defaultSlotDuration = 60
  const totalSlotDuration = defaultSlotDuration + buffer

  for (let i = 1; i <= daysInMonth; i++) {
    const currentDayMoment = targetMoment.clone().date(i)
    const dateFormatted = currentDayMoment.format('YYYY-MM-DD')
    const dayOfWeek = currentDayMoment.day()
    const dayName = dayNameMapping[dayOfWeek] as keyof typeof availability.weeklySchedule
    const isToday = dateFormatted === todayStr
    const isPast = dateFormatted < todayStr

    const daySchedule = availability.weeklySchedule?.[dayName]
    const dayBookings = bookingsByDate[dateFormatted] || []
    const bookingCount = dayBookings.length

    let status: 'available' | 'booked' | 'blocked' | 'vacation' | 'off' = 'off'
    let statusLabel = 'Non-working day'
    let dotColor: string | null = null
    let hasDot = false
    let isAvailable = false
    let reason: string | undefined = undefined
    let totalSlots = 0
    let availableSlotsCount = 0

    // Priority 1: Penalized artist -> all dates blocked
    if (isPenalized) {
      status = 'blocked'
      statusLabel = 'Blocked'
      dotColor = '#94A3B8'
      hasDot = true
      reason = 'Artist profile is temporarily penalized'
      blockedCount++
    }
    // Priority 2: Vacation
    else if (
      availability.isVacationEnabled &&
      availability.vacationStartDate &&
      availability.vacationEndDate
    ) {
      const vStart = moment(availability.vacationStartDate).format('YYYY-MM-DD')
      const vEnd = moment(availability.vacationEndDate).format('YYYY-MM-DD')
      if (dateFormatted >= vStart && dateFormatted <= vEnd) {
        status = 'vacation'
        statusLabel = 'Vacation'
        dotColor = '#F59E0B'
        hasDot = true
        reason = availability.vacationMessage || 'Artist on vacation'
        vacationCount++
      }
    }

    // Priority 3: Blocked date
    if (!isPenalized && status === 'off' && blockedDatesMap.has(dateFormatted)) {
      const blockedEntry = blockedDatesMap.get(dateFormatted)
      status = 'blocked'
      statusLabel = 'Blocked'
      dotColor = '#94A3B8'
      hasDot = true
      reason = blockedEntry?.reason
        ? `Blocked: ${blockedEntry.reason}`
        : 'Date blocked by artist'
      blockedCount++
    }

    // Priority 4: Working Day vs Off Day
    if (status === 'off') {
      if (!daySchedule || !daySchedule.isWorkingDay || !daySchedule.startTime || !daySchedule.endTime) {
        status = 'off'
        statusLabel = 'Non-working day'
        dotColor = null
        hasDot = false
        reason = 'Non-working day'
        offCount++
      } else {
        // Calculate slots capacity for this working day
        const workStart = moment(`${dateFormatted} ${daySchedule.startTime}`, 'YYYY-MM-DD HH:mm')
        const workEnd = moment(`${dateFormatted} ${daySchedule.endTime}`, 'YYYY-MM-DD HH:mm')

        const breakRanges = (daySchedule.breakTimes || []).map((b) => ({
          start: moment(`${dateFormatted} ${b.startTime}`, 'YYYY-MM-DD HH:mm'),
          end: moment(`${dateFormatted} ${b.endTime}`, 'YYYY-MM-DD HH:mm'),
        }))

        const bookingRanges = dayBookings.map((bk) => ({
          start: moment(`${dateFormatted} ${bk.startTime}`, 'YYYY-MM-DD HH:mm'),
          end: moment(`${dateFormatted} ${bk.endTime}`, 'YYYY-MM-DD HH:mm'),
        }))

        let currentSlotStart = workStart.clone()
        while (
          currentSlotStart
            .clone()
            .add(defaultSlotDuration, 'minutes')
            .isSameOrBefore(workEnd)
        ) {
          const currentSlotEnd = currentSlotStart.clone().add(defaultSlotDuration, 'minutes')
          let isBreak = false
          for (const brk of breakRanges) {
            if (currentSlotStart.isBefore(brk.end) && currentSlotEnd.isAfter(brk.start)) {
              isBreak = true
              break
            }
          }

          if (!isBreak) {
            totalSlots++
            let isBooked = false
            for (const bkg of bookingRanges) {
              if (currentSlotStart.isBefore(bkg.end) && currentSlotEnd.isAfter(bkg.start)) {
                isBooked = true
                break
              }
            }
            if (!isBooked) {
              availableSlotsCount++
            }
          }

          currentSlotStart.add(totalSlotDuration, 'minutes')
        }

        // Determine if Booked or Available
        const isMaxBookingReached = Boolean(
          availability.maxBookingPerDay && bookingCount >= availability.maxBookingPerDay
        )

        if (isMaxBookingReached || (totalSlots > 0 && availableSlotsCount === 0 && bookingCount > 0)) {
          status = 'booked'
          statusLabel = 'Booked'
          dotColor = '#F43F5E'
          hasDot = true
          reason = isMaxBookingReached ? 'Daily booking limit reached' : 'Fully booked'
          bookedCount++
        } else if (availableSlotsCount > 0) {
          status = 'available'
          statusLabel = 'Available'
          dotColor = '#10B981'
          hasDot = true
          isAvailable = !isPast
          if (isPast) {
            reason = 'Past date'
          } else {
            availableDates.push(dateFormatted)
          }
          availableCount++
        } else {
          status = 'off'
          statusLabel = 'Non-working day'
          dotColor = null
          hasDot = false
          offCount++
        }
      }
    }

    daysResult.push({
      date: dateFormatted,
      dayNumber: i,
      dayName,
      isToday,
      isPast,
      status,
      statusLabel,
      dotColor,
      hasDot,
      isAvailable,
      bookingCount,
      totalSlots,
      availableSlotsCount,
      workingHours:
        daySchedule?.isWorkingDay && daySchedule?.startTime && daySchedule?.endTime
          ? { startTime: daySchedule.startTime, endTime: daySchedule.endTime }
          : null,
      reason: reason || undefined,
    })
  }

  return {
    artistId: artistUserId,
    month: targetMoment.format('YYYY-MM'),
    monthName: targetMoment.format('MMMM YYYY'),
    totalAvailableDays: availableDates.length,
    availableDates,
    summary: {
      totalDays: daysInMonth,
      availableDays: availableCount,
      bookedDays: bookedCount,
      blockedDays: blockedCount,
      vacationDays: vacationCount,
      offDays: offCount,
    },
    legend: CALENDAR_LEGEND,
    days: daysResult,
  }
}

const getArtistAvailableSlotsForDate = async (
  artistId: string,
  dateStr?: string,
  serviceDurationMinutes = 60
) => {
  const targetDate = dateStr ? moment(dateStr, 'YYYY-MM-DD') : moment()
  if (!targetDate.isValid()) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Invalid date format, expected YYYY-MM-DD')
  }

  const formattedDate = targetDate.format('YYYY-MM-DD')
  let artistUserId = artistId
  const artistProfile = await ArtistProfile.findOne({
    $or: [
      { user: artistId },
      ...(artistId.match(/^[0-9a-fA-F]{24}$/) ? [{ _id: artistId }] : []),
    ],
  })
  if (artistProfile) {
    artistUserId = artistProfile.user.toString()
  }

  if (artistProfile?.isPenaltyRequired) {
    return {
      artistId: artistUserId,
      date: formattedDate,
      isWorkingDay: false,
      workingHours: null,
      serviceDurationMinutes,
      bufferTime: 0,
      totalSlots: 0,
      availableSlotsCount: 0,
      availableSlots: [],
      allSlots: [],
    }
  }

  const availability = await Availability.findOne({ user: artistUserId })
  if (!availability) {
    throw new AppError(httpStatus.NOT_FOUND, 'Artist has not set up availability schedule.')
  }

  const dayNameMapping: Record<number, string> = {
    0: 'sunday',
    1: 'monday',
    2: 'tuesday',
    3: 'wednesday',
    4: 'thursday',
    5: 'friday',
    6: 'saturday',
  }
  const dayName = dayNameMapping[targetDate.day()] as keyof typeof availability.weeklySchedule
  const daySchedule = availability.weeklySchedule?.[dayName]

  if (!daySchedule || !daySchedule.isWorkingDay || !daySchedule.startTime || !daySchedule.endTime) {
    return {
      artistId,
      date: formattedDate,
      isWorkingDay: false,
      reason: 'Artist does not work on this day.',
      totalSlots: 0,
      availableSlotsCount: 0,
      availableSlots: [],
      allSlots: [],
    }
  }

  if (
    availability.isVacationEnabled &&
    availability.vacationStartDate &&
    availability.vacationEndDate
  ) {
    const vStart = moment(availability.vacationStartDate).format('YYYY-MM-DD')
    const vEnd = moment(availability.vacationEndDate).format('YYYY-MM-DD')
    if (formattedDate >= vStart && formattedDate <= vEnd) {
      return {
        artistId,
        date: formattedDate,
        isWorkingDay: false,
        reason: availability.vacationMessage || 'Artist is currently on vacation.',
        totalSlots: 0,
        availableSlotsCount: 0,
        availableSlots: [],
        allSlots: [],
      }
    }
  }

  const isBlocked = await ArtistBlockedDate.findOne({
    user: artistUserId,
    date: formattedDate,
  })
  if (isBlocked) {
    return {
      artistId: artistUserId,
      date: formattedDate,
      isWorkingDay: false,
      reason: `Date blocked: ${isBlocked.reason}`,
      totalSlots: 0,
      availableSlotsCount: 0,
      availableSlots: [],
      allSlots: [],
    }
  }

  const startOfDay = targetDate.clone().startOf('day').toDate()
  const endOfDay = targetDate.clone().endOf('day').toDate()

  const existingBookings = await Booking.find({
    artist: artistUserId,
    bookingDate: { $gte: startOfDay, $lte: endOfDay },
    status: {
      $nin: [
        BOOKING_STATUS.CANCELLED,
        BOOKING_STATUS.DECLINED,
      ],
    },
  })
    .select('startTime endTime status')
    .lean()

  const buffer = availability.bufferTime || 0
  const totalSlotDuration = serviceDurationMinutes + buffer
  const workStart = moment(`${formattedDate} ${daySchedule.startTime}`, 'YYYY-MM-DD HH:mm')
  const workEnd = moment(`${formattedDate} ${daySchedule.endTime}`, 'YYYY-MM-DD HH:mm')

  const breakRanges = (daySchedule.breakTimes || []).map((b) => ({
    start: moment(`${formattedDate} ${b.startTime}`, 'YYYY-MM-DD HH:mm'),
    end: moment(`${formattedDate} ${b.endTime}`, 'YYYY-MM-DD HH:mm'),
  }))

  const bookingRanges = existingBookings.map((bk) => ({
    start: moment(`${formattedDate} ${bk.startTime}`, 'YYYY-MM-DD HH:mm'),
    end: moment(`${formattedDate} ${bk.endTime}`, 'YYYY-MM-DD HH:mm').add(buffer, 'minutes'),
  }))

  const minNoticeHours = availability.minNotice || 0
  const now = moment()
  const earliestAllowedTime = now.clone().add(minNoticeHours, 'hours')

  // Check if daily max bookings limit has been reached
  const isMaxBookingReached = Boolean(
    availability.maxBookingPerDay &&
      existingBookings.length >= availability.maxBookingPerDay
  )

  const slots = []
  let currentSlotStart = workStart.clone()

  while (
    currentSlotStart
      .clone()
      .add(serviceDurationMinutes, 'minutes')
      .isSameOrBefore(workEnd)
  ) {
    const currentSlotEnd = currentSlotStart.clone().add(serviceDurationMinutes, 'minutes')
    const slotStartTimeStr = currentSlotStart.format('HH:mm')
    const slotEndTimeStr = currentSlotEnd.format('HH:mm')

    let isSlotAvailable = true
    let conflictReason = ''

    if (currentSlotStart.isBefore(now)) {
      isSlotAvailable = false
      conflictReason = 'Time has passed'
    } else if (currentSlotStart.isBefore(earliestAllowedTime)) {
      isSlotAvailable = false
      conflictReason =
        minNoticeHours > 0 ? `Requires ${minNoticeHours}h advance notice` : 'Time has passed'
    }

    if (isSlotAvailable && isMaxBookingReached) {
      isSlotAvailable = false
      conflictReason = `Daily booking limit reached (max: ${availability.maxBookingPerDay})`
    }

    if (isSlotAvailable) {
      for (const brk of breakRanges) {
        if (currentSlotStart.isBefore(brk.end) && currentSlotEnd.isAfter(brk.start)) {
          isSlotAvailable = false
          conflictReason = 'Break time'
          break
        }
      }
    }

    if (isSlotAvailable) {
      for (const bkg of bookingRanges) {
        if (currentSlotStart.isBefore(bkg.end) && currentSlotEnd.isAfter(bkg.start)) {
          isSlotAvailable = false
          conflictReason = 'Already booked'
          break
        }
      }
    }

    slots.push({
      startTime: slotStartTimeStr,
      endTime: slotEndTimeStr,
      durationMinutes: serviceDurationMinutes,
      isAvailable: isSlotAvailable,
      reason: conflictReason || undefined,
    })

    currentSlotStart.add(totalSlotDuration, 'minutes')
  }

  const availableSlots = slots.filter((s) => s.isAvailable)

  return {
    artistId: artistUserId,
    date: formattedDate,
    isWorkingDay: true,
    workingHours: {
      startTime: daySchedule.startTime,
      endTime: daySchedule.endTime,
    },
    serviceDurationMinutes,
    bufferTime: buffer,
    minNoticeHours,
    maxBookingPerDay: availability.maxBookingPerDay || null,
    currentBookingsCount: existingBookings.length,
    isMaxBookingReached,
    totalSlots: slots.length,
    availableSlotsCount: availableSlots.length,
    availableSlots,
    allSlots: slots,
  }
}

export const availabilityServices = {
  createAvailability,
  updateAvailability,
  getAllAvailability,
  getAvailabilityByUserId,
  deleteAvailabilityById,
  getArtistAvailableDaysInMonth,
  getArtistAvailableSlotsForDate,
}
