import moment from 'moment'
import type { IBreakTime, IWorkingDay } from '@repo/db'

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
