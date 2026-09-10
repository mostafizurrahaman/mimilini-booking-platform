import { z, ZodIssueCode } from 'zod'
import { URL_REGEX } from '../constants/regex'
import mongoose from 'mongoose'

/**
 * Creates a required string schema.
 *
 * The field:
 *   - must be present (not undefined),
 *   - must be a string,
 *   - is trimmed,
 *   - must not be empty after trimming.
 *
 * @param {string} fieldName - The display name of the field for errors.
 * @returns {import('zod').ZodEffects<import('zod').ZodString>} Zod string schema
 */
export const requiredString = (fieldName = 'Field') => {
  return z
    .string({
      error: (issue) => {
        if (issue.code === ZodIssueCode.invalid_type && issue.input === undefined) {
          return `${fieldName} is required`
        }

        if (issue.code === ZodIssueCode.invalid_type) {
          return `${fieldName} must be a string`
        }
        return undefined
      },
    })
    .trim()
    .min(1, { message: `${fieldName} cannot be empty` })
}

/**
 * Creates an optional string schema.
 *
 * The field:
 *   - may be undefined,
 *   - if provided, must be a string,
 *   - is trimmed,
 *   - if not undefined, must not be empty.
 *
 * @param {string} fieldName - The display name of the field for errors.
 * @returns {import('zod').ZodOptional<import('zod').ZodEffects<import('zod').ZodString>>} Optional Zod string schema
 */
export const optionalString = (fieldName = 'Field') =>
  z
    .string({
      error: (issue) => {
        if (issue.code === ZodIssueCode.invalid_type && issue.input === undefined) {
          return undefined
        }

        if (issue.code === ZodIssueCode.invalid_type) {
          return `${fieldName} must be a string`
        }
        return undefined
      },
    })
    .trim()
    .min(1, { message: `${fieldName} cannot be empty` })
    .optional()

/**
 * Creates a nullable string schema.
 *
 * The field:
 *   - can be null,
 *   - if not null, must be a non-empty trimmed string.
 *
 * @param {string} fieldName - The display name of the field for errors.
 * @returns {import('zod').ZodNullable<import('zod').ZodEffects<import('zod').ZodString>>} Nullable Zod string schema
 */
export const nullableString = (fieldName = 'Field') =>
  z
    .string({
      error: () => `${fieldName} must be a string`,
    })
    .trim()
    .min(1, { message: `${fieldName} cannot be empty` })
    .nullable()

/**
 * Creates an optional and nullable string schema.
 *
 * The field:
 *   - may be undefined or null,
 *   - if provided and not null, must be a non-empty trimmed string.
 *
 * @param {string} fieldName - The display name of the field for errors.
 * @returns {import('zod').ZodNullable<import('zod').ZodOptional<import('zod').ZodEffects<import('zod').ZodString>>>}
 */
export const optionalNullableString = (fieldName = 'Field') =>
  z
    .string({
      error: () => `${fieldName} must be a string`,
    })
    .trim()
    .min(1, { message: `${fieldName} cannot be empty` })
    .optional()
    .nullable()

/**
 * URL string validator with regex
 *
 * Acceptable formats:
 * - http://example.com
 * - https://www.example.org/path?query=1
 * - includes optional www, paths, query, fragment
 *
 * @param {string} fieldName - Name used in error messages
 */
export const urlString = (fieldName = 'URL') =>
  z
    .string({
      error: (issue) => {
        // Type not string or undefined
        if (issue.code === ZodIssueCode.invalid_type) {
          return `${fieldName} must be a string`
        }
        return undefined
      },
    })
    .trim()
    .regex(URL_REGEX, {
      message: `${fieldName} must be a valid http/https URL`,
    })

export const requiredMongooseId = (fieldName = 'Field') => {
  return z
    .string({
      error: (issue) => {
        if (issue.code === ZodIssueCode.invalid_type && issue.input === undefined) {
          return `${fieldName} is required`
        }

        if (issue.code === ZodIssueCode.invalid_type) {
          return `${fieldName} must be a string`
        }

        return undefined
      },
    })
    .trim()
    .min(1, { message: `${fieldName} cannot be empty` })
    .refine(
      (val) => {
        return mongoose.isValidObjectId(val)
      },
      {
        error: () => 'Invalid mongoose ID!',
      }
    )
}
