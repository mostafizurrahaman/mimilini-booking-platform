import { z, ZodIssueCode } from 'zod'
import { DATE_ONLY_REGEX } from '../constants/regex'
import { isValidDateOnly, toDateOnly } from '../libs/date.helper'

/**
 * Required date validator
 * Accepts Date objects or ISO date strings (coerces to Date).
 * @param fieldName - Name used in error messages
 */
export const requiredDate = (fieldName: string = 'Value') =>
  z.preprocess(
    (val) => {
      if (typeof val === 'string' || typeof val === 'number') {
        const d = new Date(val)
        return isNaN(d.getTime()) ? val : d
      }
      return val
    },
    z.date({
      error: (issue) =>
        issue.code === ZodIssueCode.invalid_type && issue.input === undefined
          ? `${fieldName} is required`
          : `${fieldName} must be a valid date`,
    })
  )

/**
 * Optional date validator
 * Accepts Date object or ISO string; allows undefined.
 */
export const optionalDate = (fieldName: string = 'Value') => requiredDate(fieldName).optional()

/**
 * Optional + Nullable date validator
 */
export const optionalNullableDate = (fieldName: string = 'Value') =>
  requiredDate(fieldName).optional().nullable()

/**
 * Required calendar date stored as YYYY-MM-DD.
 * Accepts YYYY-MM-DD or an ISO datetime and keeps the calendar date prefix.
 */
export const dateOnlyString = (fieldName: string = 'Date') =>
  z.preprocess(
    (val) => {
      if (typeof val === 'string' || val instanceof Date) {
        try {
          return toDateOnly(val)
        } catch {
          return val
        }
      }
      return val
    },
    z
      .string({
        error: (issue) =>
          issue.code === ZodIssueCode.invalid_type && issue.input === undefined
            ? `${fieldName} is required`
            : `${fieldName} must be in YYYY-MM-DD format`,
      })
      .regex(DATE_ONLY_REGEX, {
        message: `${fieldName} must be in YYYY-MM-DD format`,
      })
      .refine((val) => isValidDateOnly(val), {
        message: `${fieldName} must be a valid calendar date`,
      })
  )

export const optionalDateOnlyString = (fieldName: string = 'Date') =>
  dateOnlyString(fieldName).optional()
