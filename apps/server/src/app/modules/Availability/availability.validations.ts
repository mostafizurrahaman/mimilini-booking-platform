import z from 'zod'
import {
  requiredString,
  optionalNumber,
  optionalEnumString,
  optionalString,
  optionalDate,
  sortingOrderValues,
  sortOrder,
  optionalNullableDate,
  optionalNullableString,
  requiredNumber,
  positiveNumber,
  enumString,
} from '@repo/shared'
import { availabilitySortableFields, repetitionTypeValues } from '@repo/db'
import moment from 'moment'

// Validate 24 hours format:
const timeFormatRegex = /^([01]\d|2[0-3]):([0-5]\d)$/

// 1. Working Day validation Schema:
const workingDayValidationSchema = z
  .object(
    {
      isWorkingDay: z.coerce.boolean({
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

      breakStartTime: z
        .string()
        .regex(timeFormatRegex, {
          error: 'Break start time must be in HH:mm (24-hour) format',
        })
        .optional()
        .nullable(),

      breakEndTime: z
        .string()
        .regex(timeFormatRegex, {
          error: 'Break end time must be in HH:mm (24-hour) format',
        })
        .optional()
        .nullable(),
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
    if (!data.isWorkingDay) return

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

    const startTime = moment(data.startTime, 'HH:mm')
    const endTime = moment(data.endTime, 'HH:mm')

    // Start time must be before end time
    if (endTime.isSameOrBefore(startTime)) {
      ctx.addIssue({
        code: 'custom',
        path: ['endTime'],
        message: 'End time must be after start time',
      })
    }

    // Break start and break end must be provided together
    if (!data.breakStartTime && data.breakEndTime) {
      ctx.addIssue({
        code: 'custom',
        path: ['breakStartTime'],
        message: 'Break start time is required when break end time is provided',
      })
    }

    if (data.breakStartTime && !data.breakEndTime) {
      ctx.addIssue({
        code: 'custom',
        path: ['breakEndTime'],
        message: 'Break end time is required when break start time is provided',
      })
    }

    if (!data.breakStartTime || !data.breakEndTime) return

    const breakStartTime = moment(data.breakStartTime, 'HH:mm')
    const breakEndTime = moment(data.breakEndTime, 'HH:mm')

    // Break end must be after break start
    if (breakEndTime.isSameOrBefore(breakStartTime)) {
      ctx.addIssue({
        code: 'custom',
        path: ['breakEndTime'],
        message: 'Break end time must be after break start time',
      })
    }

    // Break start must be inside working hours
    if (!breakStartTime.isBetween(startTime, endTime)) {
      ctx.addIssue({
        code: 'custom',
        path: ['breakStartTime'],
        message: 'Break start time must be between start time and end time',
      })
    }

    // Break end must be inside working hours
    if (!breakEndTime.isBetween(startTime, endTime)) {
      ctx.addIssue({
        code: 'custom',
        path: ['breakEndTime'],
        message: 'Break end time must be between start time and end time',
      })
    }
  })

// ২. মূল Create / Save Availability Schema
const createAvailabilitySchema = z.object({
  body: z
    .object({
      timezone: optionalString('Timezone').default('Australia/Sydney'),

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
      isVacationEnabled: z.coerce
        .boolean({
          error: 'isQuickBookingEnabled should be true/false',
        })
        .default(false),
      vacationStartDate: optionalNullableDate('Vacation start date'),
      vacationEndDate: optionalNullableDate('Vacation end date'),
      vacationMessage: optionalNullableString('Vacation message'),

      // Quick / Instant Booking
      isQuickBookingEnabled: z.coerce
        .boolean({
          error: 'isQuickBookingEnabled should be true/false',
        })
        .default(true),
      minNotice: requiredNumber('Minimum notice hours').min(0, {
        error: 'Minimum notice cannot be negative',
      }),
      bufferTime: requiredNumber('Buffer time in minutes').min(0, {
        error: 'Buffer time cannot be negative',
      }),
      maxBookingPerDay: positiveNumber('Maximum bookings per day').min(1, {
        error: 'Max booking per day must be at least 1',
      }),

      // Repetition Pattern
      repetitionType: enumString(repetitionTypeValues, 'Repetition type'),
    })
    .superRefine((data, ctx) => {
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
          const start = moment(data.vacationStartDate)
          const end = moment(data.vacationEndDate)

          if (end.isSameOrBefore(start)) {
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

const updateAvailabilitySchema = z.object({
  params: z.object({
    id: requiredString('ID'),
  }),
  body: z.object({}),
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
