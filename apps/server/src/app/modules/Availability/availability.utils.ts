import moment from 'moment-timezone'
import type { IBreakTime, IWeeklySchedule, IWorkingDay } from '@repo/db'

export type TBreakTimeInput = {
  title?: string | null | undefined
  startTime?: string | null | undefined
  endTime?: string | null | undefined
}

export type TWorkingDayInput = {
  isWorkingDay: boolean
  startTime?: string | null | undefined
  endTime?: string | null | undefined
  breakTimes?: TBreakTimeInput[] | undefined
}

const parseTime = (value?: string | null) => {
  if (!value) return null
  const parsed = moment(value, 'HH:mm', true)
  return parsed.isValid() ? parsed : null
}

/**
 * Checks if a time range is within another time range.
 */
export const isTimeRangeWithin = (
  startTime: string,
  endTime: string,
  parentStartTime: string,
  parentEndTime: string
): boolean => {
  const start = parseTime(startTime)
  const end = parseTime(endTime)
  const parentStart = parseTime(parentStartTime)
  const parentEnd = parseTime(parentEndTime)

  if (!start || !end || !parentStart || !parentEnd) {
    return false
  }

  return !start.isBefore(parentStart) && !end.isAfter(parentEnd)
}

export const findOverlappingBreakIndexes = (
  breakTimes: TBreakTimeInput[]
): { first: number; second: number } | null => {
  for (let i = 0; i < breakTimes.length; i++) {
    const currentStart = parseTime(breakTimes[i]?.startTime)
    const currentEnd = parseTime(breakTimes[i]?.endTime)
    if (!currentStart || !currentEnd) continue

    for (let j = i + 1; j < breakTimes.length; j++) {
      const nextStart = parseTime(breakTimes[j]?.startTime)
      const nextEnd = parseTime(breakTimes[j]?.endTime)
      if (!nextStart || !nextEnd) continue

      const isOverlap = currentStart.isBefore(nextEnd) && currentEnd.isAfter(nextStart)
      if (isOverlap) {
        return { first: i, second: j }
      }
    }
  }

  return null
}

/**
 * Checks whether any break time ranges overlap with each other.
 * Adjacent ranges that only touch (e.g. 12:00-13:00 and 13:00-14:00) are allowed.
 */
export const checkHasAnyOverlap = (breakTimes: IBreakTime[] | TBreakTimeInput[]): boolean => {
  return findOverlappingBreakIndexes(breakTimes) !== null
}

export const findBreakOutsideWorkingHours = (
  breakTimes: TBreakTimeInput[],
  parentStartTime: string,
  parentEndTime: string
): number => {
  return breakTimes.findIndex((breakTime) => {
    if (!breakTime.startTime || !breakTime.endTime) return false
    return !isTimeRangeWithin(
      breakTime.startTime,
      breakTime.endTime,
      parentStartTime,
      parentEndTime
    )
  })
}

export const getInvalidBreakTimeIssues = (
  breakTimes: TBreakTimeInput[],
  workStartTime?: string | null,
  workEndTime?: string | null
): { path: (string | number)[]; message: string }[] => {
  const issues: { path: (string | number)[]; message: string }[] = []

  if (!breakTimes.length) return issues

  if (workStartTime && workEndTime) {
    breakTimes.forEach((breakTime, index) => {
      if (!breakTime.startTime || !breakTime.endTime) return

      if (!isTimeRangeWithin(breakTime.startTime, breakTime.endTime, workStartTime, workEndTime)) {
        issues.push({
          path: ['breakTimes', index],
          message: 'Break time must be inside working hours',
        })
      }
    })
  }

  const overlap = findOverlappingBreakIndexes(breakTimes)
  if (overlap) {
    issues.push({
      path: ['breakTimes', overlap.second],
      message: 'Break times cannot overlap',
    })
  }

  return issues
}

export const getBreakTimesValidationError = (
  breakTimes: TBreakTimeInput[],
  workStartTime: string,
  workEndTime: string
): string | null => {
  const issues = getInvalidBreakTimeIssues(breakTimes, workStartTime, workEndTime)
  return issues[0]?.message ?? null
}

export const normalizeBreakTimes = (breakTimes?: TBreakTimeInput[] | null): IBreakTime[] => {
  if (!breakTimes?.length) return []

  return breakTimes
    .filter((breakTime) => Boolean(breakTime.startTime) && Boolean(breakTime.endTime))
    .map((breakTime) => ({
      title: breakTime.title?.trim() ? breakTime.title.trim() : null,
      startTime: breakTime.startTime as string,
      endTime: breakTime.endTime as string,
    }))
}

export const normalizeWorkingDay = (day: TWorkingDayInput): IWorkingDay => {
  if (!day.isWorkingDay) {
    return {
      isWorkingDay: false,
      startTime: null,
      endTime: null,
      breakTimes: [],
    }
  }

  return {
    isWorkingDay: true,
    startTime: day.startTime ?? null,
    endTime: day.endTime ?? null,
    breakTimes: normalizeBreakTimes(day.breakTimes),
  }
}

export interface IScheduleConflictBooking {
  bookingNumber?: string | null
  bookingDate: Date | string
  startTime: string
  endTime: string
}

const WEEKDAY_NAMES = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const

const normalizeToHHmm = (value?: string | null): string | null => {
  if (!value) return null
  const parsed = moment(value.trim(), ['HH:mm', 'hh:mm A', 'h:mm A', 'hh:mma', 'h:mma'], true)
  return parsed.isValid() ? parsed.format('HH:mm') : null
}

const doTimeRangesOverlap = (
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string
): boolean => {
  const startA = parseTime(aStart)
  const endA = parseTime(aEnd)
  const startB = parseTime(bStart)
  const endB = parseTime(bEnd)

  if (!startA || !endA || !startB || !endB) return false
  return startA.isBefore(endB) && endA.isAfter(startB)
}

const areWorkingDaysEqual = (a?: IWorkingDay | null, b?: IWorkingDay | null): boolean => {
  const aWorking = Boolean(a?.isWorkingDay)
  const bWorking = Boolean(b?.isWorkingDay)
  if (aWorking !== bWorking) return false
  if (!aWorking) return true

  if ((a?.startTime ?? null) !== (b?.startTime ?? null)) return false
  if ((a?.endTime ?? null) !== (b?.endTime ?? null)) return false

  const aBreaks = a?.breakTimes ?? []
  const bBreaks = b?.breakTimes ?? []
  if (aBreaks.length !== bBreaks.length) return false

  return aBreaks.every(
    (brk, idx) =>
      brk.startTime === bBreaks[idx]?.startTime && brk.endTime === bBreaks[idx]?.endTime
  )
}

/**
 * Checks whether proposed weeklySchedule changes make any existing future active booking unavailable
 * (day turned off, working hours reduced/shifted, or break time overlapping a booking).
 */
export const findScheduleUpdateBookingConflict = (
  existingSchedule: IWeeklySchedule,
  proposedDays: Partial<Record<string, IWorkingDay>>,
  bookings: IScheduleConflictBooking[],
  timezone: string,
  now: Date = new Date()
): string | null => {
  const changedDays: Record<string, IWorkingDay> = {}

  for (const [dayKey, proposedDay] of Object.entries(proposedDays)) {
    if (!proposedDay) continue
    const existingDay = (existingSchedule as Record<string, IWorkingDay | undefined>)?.[dayKey]
    if (!areWorkingDaysEqual(existingDay, proposedDay)) {
      changedDays[dayKey] = proposedDay
    }
  }

  if (Object.keys(changedDays).length === 0 || bookings.length === 0) {
    return null
  }

  const nowInTz = moment.tz(now, timezone)
  const todayStr = nowInTz.format('YYYY-MM-DD')

  for (const booking of bookings) {
    const bookingDateStr = moment(booking.bookingDate).format('YYYY-MM-DD')
    if (bookingDateStr < todayStr) continue

    const bStart = normalizeToHHmm(booking.startTime)
    const bEnd = normalizeToHHmm(booking.endTime)
    if (!bStart || !bEnd) continue

    const bookingEndInTz = moment.tz(`${bookingDateStr} ${bEnd}`, 'YYYY-MM-DD HH:mm', timezone)
    if (bookingEndInTz.isSameOrBefore(nowInTz)) continue

    const weekday = WEEKDAY_NAMES[moment(bookingDateStr, 'YYYY-MM-DD').day()]
    const proposedDay = weekday ? changedDays[weekday] : undefined
    if (!proposedDay) continue

    const ref = booking.bookingNumber ? `#${booking.bookingNumber} ` : ''

    if (!proposedDay.isWorkingDay) {
      return `Cannot mark ${weekday} as unavailable because active booking ${ref}is scheduled on ${bookingDateStr} (${bStart} - ${bEnd}).`
    }

    if (
      !proposedDay.startTime ||
      !proposedDay.endTime ||
      !isTimeRangeWithin(bStart, bEnd, proposedDay.startTime, proposedDay.endTime)
    ) {
      return `Cannot update ${weekday} working hours (${proposedDay.startTime} - ${proposedDay.endTime}) because active booking ${ref}is scheduled on ${bookingDateStr} (${bStart} - ${bEnd}).`
    }

    const overlappingBreak = proposedDay.breakTimes.find(
      (brk) =>
        Boolean(brk.startTime && brk.endTime) &&
        doTimeRangesOverlap(bStart, bEnd, brk.startTime as string, brk.endTime as string)
    )

    if (overlappingBreak) {
      return `Cannot set break time (${overlappingBreak.startTime} - ${overlappingBreak.endTime}) on ${weekday} because active booking ${ref}is scheduled on ${bookingDateStr} (${bStart} - ${bEnd}).`
    }
  }

  return null
}
