import z from 'zod'
import {
  requiredString,
  optionalNumber,
  optionalEnumString,
  optionalString,
  optionalDate,
  sortingOrderValues,
  optionalNullableDate,
  optionalNullableString,
  requiredNumber,
  positiveNumber,
  enumString,
  isValidTimeZone,
} from '@repo/shared'
import { availabilitySortableFields, repetitionTypeValues } from '@repo/db'
import moment from 'moment-timezone'
import { getInvalidBreakTimeIssues, type TBreakTimeInput } from './availability.utils'

// Validate 24 hours format:
const timeFormatRegex = /^([01]\d|2[0-3]):([0-5]\d)$/

const applyBreakTimesRules = (
  data: {
    isWorkingDay?: boolean | undefined
    startTime?: string | null | undefined
    endTime?: string | null | undefined
    breakTimes?: TBreakTimeInput[] | undefined
  },
  ctx: z.RefinementCtx
) => {
  if (data.isWorkingDay === false && data.breakTimes && data.breakTimes.length > 0) {
    ctx.addIssue({
      code: 'custom',
      path: ['breakTimes'],
      message: 'Break times are not allowed on a non-working day',
    })
    return
  }

  if (!data.breakTimes?.length) return

  const issues = getInvalidBreakTimeIssues(data.breakTimes, data.startTime, data.endTime)

  for (const issue of issues) {
    ctx.addIssue({
      code: 'custom',
      path: issue.path,
      message: issue.message,
    })
  }
}

// 1. Working Day BreakTime Validation Schema:
const breakTimeSchema = z
  .object({
    title: z
      .string({ error: 'Title must be a string' })
      .trim()
      .optional()
      .nullable(),
    startTime: z.string().regex(timeFormatRegex, {
      error: 'Break start time must be in HH:mm (24-hour) format',
    }),
    endTime: z.string().regex(timeFormatRegex, {
      error: 'Break end time must be in HH:mm (24-hour) format',
    }),
  })
  .superRefine((data, ctx) => {
    const startTime = moment(data.startTime, 'HH:mm', true)
    const endTime = moment(data.endTime, 'HH:mm', true)

    if (!startTime.isValid()) {
      ctx.addIssue({
        code: 'custom',
        path: ['startTime'],
        message: 'Break start time format should be HH:mm.',
      })
    }

    if (!endTime.isValid()) {
      ctx.addIssue({
        code: 'custom',
        path: ['endTime'],
        message: 'Break end time format should be HH:mm.',
      })
    }

    if (startTime.isValid() && endTime.isValid() && endTime.isSameOrBefore(startTime)) {
      ctx.addIssue({
        code: 'custom',
        path: ['endTime'],
        message: 'Break end time must be after break start time',
      })
    }
  })

// 1. Working Day validation Schema:
const workingDayValidationSchema = z
  .object(
    {
      isWorkingDay: z.boolean({
        error: 'isWorkingDay must be a true/false',
      }),

      startTime: z
        .string()
        .regex(timeFormatRegex, {
          error: 'Start time must be in HH:mm (24-hour) format',
        })
        .optional()
        .nullable(),

      endTime: z
        .string()
        .regex(timeFormatRegex, {
          error: 'End time must be in HH:mm (24-hour) format',
        })
        .optional()
        .nullable(),
      breakTimes: z
        .array(breakTimeSchema, {
          error: 'Break times should be an array.',
        })
        .max(10, {
          error: 'You cannot add more than 10 breaks in a day',
        })
        .optional()
        .default([]),
    },
    {
      error: (issue) => {
        if (issue.code === 'invalid_type' && issue.input === undefined) {
          const day = issue.path?.[issue.path.length - 1]

          if (day) {
            const formattedDay = String(day).charAt(0).toUpperCase() + String(day).slice(1)

            return `${formattedDay} schedule is required`
          }
        }

        return 'Invalid weekly schedule'
      },
    }
  )
  .superRefine((data, ctx) => {
    // If the day is not a working day,
    // no time validation is required.
    if (!data.isWorkingDay) {
      applyBreakTimesRules(data, ctx)
      return
    }

    // Working day requires start and end time
    if (!data.startTime) {
      ctx.addIssue({
        code: 'custom',
        path: ['startTime'],
        message: 'Start time is required for an active working day',
      })
    }

    if (!data.endTime) {
      ctx.addIssue({
        code: 'custom',
        path: ['endTime'],
        message: 'End time is required for an active working day',
      })
    }

    if (!data.startTime || !data.endTime) return

    const startTime = moment(data.startTime, 'HH:mm', true)
    const endTime = moment(data.endTime, 'HH:mm', true)

    if (!startTime.isValid()) {
      ctx.addIssue({
        code: 'custom',
        path: ['startTime'],
        message: 'Start time must be in HH:mm (24-hour) format',
      })
    }

    if (!endTime.isValid()) {
      ctx.addIssue({
        code: 'custom',
        path: ['endTime'],
        message: 'End time must be in HH:mm (24-hour) format',
      })
    }

    if (startTime.isValid() && endTime.isValid() && endTime.isSameOrBefore(startTime)) {
      ctx.addIssue({
        code: 'custom',
        path: ['endTime'],
        message: 'End time must be after start time',
      })
    }

    applyBreakTimesRules(data, ctx)
  })

// 1.  Create / Save Availability Schema
const createAvailabilitySchema = z.object({
  body: z
    .object({
      timezone: optionalString('Timezone')
        .refine((val) => isValidTimeZone(val as string), {
          error: 'Invalid timezone',
        })
        .default('Australia/Sydney'),

      // ?? Full week schedule:
      weeklySchedule: z.object({
        monday: workingDayValidationSchema,
        tuesday: workingDayValidationSchema,
        wednesday: workingDayValidationSchema,
        thursday: workingDayValidationSchema,
        friday: workingDayValidationSchema,
        saturday: workingDayValidationSchema,
        sunday: workingDayValidationSchema,
      }),

      // Vacation Mode
      isVacationEnabled: z
        .boolean({
          error: 'isQuickBookingEnabled should be true/false',
        })
        .default(false),
      vacationStartDate: optionalNullableDate('Vacation start date'),
      vacationEndDate: optionalNullableDate('Vacation end date'),
      vacationMessage: optionalNullableString('Vacation message'),

      // Quick / Instant Booking
      isQuickBookingEnabled: z
        .boolean({
          error: 'isQuickBookingEnabled should be true/false',
        })
        .default(true),
      minNotice: requiredNumber('Minimum notice hours')
        .min(0, {
          error: 'Minimum notice cannot be negative',
        })
        .max(120, {
          error: 'Minimum notice cannot exceed 120 hours',
        }),

      bufferTime: requiredNumber('Buffer time in minutes')
        .min(0, {
          error: 'Buffer time cannot be negative',
        })
        .max(120, {
          error: 'Buffer time cannot exceed 120 minutes',
        }),

      maxBookingPerDay: positiveNumber('Maximum bookings per day')
        .min(1, {
          error: 'Maximum bookings per day must be at least 1',
        })
        .max(100, {
          error: 'Maximum bookings per day cannot exceed 100',
        }),

      // Repetition Pattern
      repetitionType: enumString(repetitionTypeValues, 'Repetition type'),
    })
    .superRefine((data, ctx) => {
      if (!isValidTimeZone(data.timezone)) {
        ctx.addIssue({
          code: 'custom',
          path: ['timezone'],
          message: 'Invalid timezone',
        })
      }

      const tz = data.timezone

      // ?? If vacation mode enabled, start and end vacation date is required:
      if (data.isVacationEnabled) {
        if (!data.vacationStartDate) {
          ctx.addIssue({
            code: 'custom',
            path: ['vacationStartDate'],
            message: 'Vacation start date is required when vacation mode is enabled',
          })
        }
        if (!data.vacationEndDate) {
          ctx.addIssue({
            code: 'custom',
            path: ['vacationEndDate'],
            message: 'Vacation end date is required when vacation mode is enabled',
          })
        }

        if (data.vacationStartDate && data.vacationEndDate) {
          const start = moment.tz(data.vacationStartDate, tz).startOf('day')
          const end = moment(data.vacationEndDate, tz).startOf('day')

          if (!start.isValid()) {
            ctx.addIssue({
              code: 'custom',
              path: ['vacationStartDate'],
              message: 'Invalid vacation start date',
            })
          }

          if (!end.isValid()) {
            ctx.addIssue({
              code: 'custom',
              path: ['vacationEndDate'],
              message: 'Invalid vacation end date',
            })
          }

          if (start.isValid() && end.isValid() && end.isSameOrBefore(start)) {
            ctx.addIssue({
              code: 'custom',
              path: ['vacationEndDate'],
              message: 'Vacation end date cannot be earlier than start date',
            })
          }
        }
      }
    }),
})

const updateWorkingDayValidationSchema = z
  .object({
    isWorkingDay: z
      .boolean({
        error: 'isWorkingDay must be a boolean (true/false)',
      })
      .optional(),

    startTime: z
      .string()
      .regex(timeFormatRegex, {
        error: 'Start time must be in HH:mm (24-hour) format',
      })
      .optional()
      .nullable(),

    endTime: z
      .string()
      .regex(timeFormatRegex, {
        error: 'End time must be in HH:mm (24-hour) format',
      })
      .optional()
      .nullable(),

    breakTimes: z
      .array(breakTimeSchema, {
        error: 'Break times should be an array.',
      })
      .max(10, {
        error: 'You cannot add more than 10 breaks in a day',
      })
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (data.isWorkingDay === false) {
      applyBreakTimesRules(data, ctx)
      return
    }

    if (data.startTime && data.endTime) {
      const startTime = moment(data.startTime, 'HH:mm', true)
      const endTime = moment(data.endTime, 'HH:mm', true)

      if (startTime.isValid() && endTime.isValid() && endTime.isSameOrBefore(startTime)) {
        ctx.addIssue({
          code: 'custom',
          path: ['endTime'],
          message: 'End time must be after start time',
        })
      }
    }

    applyBreakTimesRules(data, ctx)
  })

// 2. Update Availability Schema:
const updateAvailabilitySchema = z.object({
  body: z
    .object({
      timezone: optionalString('Timezone'),

      // Weekly Schedule:
      weeklySchedule: z
        .object({
          monday: updateWorkingDayValidationSchema.optional(),
          tuesday: updateWorkingDayValidationSchema.optional(),
          wednesday: updateWorkingDayValidationSchema.optional(),
          thursday: updateWorkingDayValidationSchema.optional(),
          friday: updateWorkingDayValidationSchema.optional(),
          saturday: updateWorkingDayValidationSchema.optional(),
          sunday: updateWorkingDayValidationSchema.optional(),
        })
        .optional(),

      // Vacation Mode
      isVacationEnabled: z
        .boolean({
          error: 'isVacationEnabled must be true/false',
        })
        .optional(),
      vacationStartDate: optionalNullableDate('Vacation start date'),
      vacationEndDate: optionalNullableDate('Vacation end date'),
      vacationMessage: optionalNullableString('Vacation message'),

      // Quick / Instant Booking
      isQuickBookingEnabled: z
        .boolean({
          error: 'isQuickBookingEnabled must be true/false',
        })
        .optional(),
      minNotice: requiredNumber('Minimum notice hours')
        .min(0, {
          error: 'Minimum notice cannot be negative',
        })
        .max(120, {
          error: 'Minimum notice cannot exceed 120 hours',
        })
        .optional(),

      bufferTime: requiredNumber('Buffer time in minutes')
        .min(0, {
          error: 'Buffer time cannot be negative',
        })
        .max(120, {
          error: 'Buffer time cannot exceed 120 minutes',
        })
        .optional(),

      maxBookingPerDay: positiveNumber('Maximum bookings per day')
        .min(1, {
          error: 'Maximum bookings per day must be at least 1',
        })
        .max(100, {
          error: 'Maximum bookings per day cannot exceed 100',
        })
        .optional(),

      // Repetition Pattern
      repetitionType: enumString(repetitionTypeValues, 'Repetition type').optional(),
    })
    .superRefine((data, ctx) => {
      // If validation mode is true:
      if (data.isVacationEnabled === true) {
        if (data.vacationStartDate && data.vacationEndDate) {
          const start = moment(data.vacationStartDate).startOf('day')
          const end = moment(data.vacationEndDate).startOf('day')

          if (end.isBefore(start)) {
            ctx.addIssue({
              code: 'custom',
              path: ['vacationEndDate'],
              message: 'Vacation end date cannot be earlier than start date',
            })
          }

          if (end.diff(start, 'days') < 1) {
            ctx.addIssue({
              code: 'custom',
              path: ['vacationEndDate'],
              message: 'Vacation end date must be at least one day after the start date.',
            })
          }
        }
      }
    }),
})

const getAllAvailabilitySchema = z.object({
  query: z.object({
    page: optionalNumber('Page'),
    limit: optionalNumber('Limit'),
    searchTerm: optionalString('Search term'),
    sortOrder: optionalEnumString(sortingOrderValues, 'Sort order'),
    sortBy: optionalEnumString(availabilitySortableFields, 'Sort by'),
    fromDate: optionalDate('From date'),
    toDate: optionalDate('To date'),
  }),
})

const getAvailabilityByIdSchema = z.object({
  params: z.object({
    id: requiredString('ID'),
  }),
})

const deleteAvailabilityByIdSchema = z.object({
  params: z.object({
    id: requiredString('ID'),
  }),
})

export const availabilityValidations = {
  createAvailabilitySchema,
  updateAvailabilitySchema,
  getAllAvailabilitySchema,
  getAvailabilityByIdSchema,
  deleteAvailabilityByIdSchema,
}

export type TCreateAvailabilityPayloadType = z.infer<typeof createAvailabilitySchema.shape.body>
export type TUpdateAvailabilityPayloadType = z.infer<typeof updateAvailabilitySchema.shape.body>
export type TGetAllAvailabilityQueryParamsType = z.infer<
  typeof getAllAvailabilitySchema.shape.query
>
export type TGetAvailabilityByIdParamsType = z.infer<typeof getAvailabilityByIdSchema.shape.params>
export type TDeleteAvailabilityByIdParamsType = z.infer<
  typeof deleteAvailabilityByIdSchema.shape.params
>
