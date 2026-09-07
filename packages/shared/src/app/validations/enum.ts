import { z, ZodIssueCode } from 'zod'

/**
 * Simple string enum validator.
 *
 * Accepts only one of the exact allowed values.
 * @param values - The tuple of allowed enum strings
 * @param fieldName - Field name for error messages
 */
export const enumString = <T extends readonly string[]>(values: T, fieldName = 'Value') =>
  z.enum(values, {
    error: (issue) => {
      if (issue.code === ZodIssueCode.invalid_value) {
        return {
          message: `${fieldName} must be one of: ${values.join(', ')}`,
        }
      }
      return { message: `${fieldName} must be a valid string` }
    },
  })

/**
 * Simple string enum validator.
 *
 * Accepts only one of the exact allowed values.
 * @param values - The tuple of allowed enum strings
 * @param fieldName - Field name for error messages
 */
export const optionalEnumString = <T extends readonly string[]>(values: T, fieldName = 'Value') =>
  enumString(values, fieldName).optional()

/**
 * Simple string enum validator.
 *
 * Accepts only one of the exact allowed values.
 * @param values - The tuple of allowed enum strings
 * @param fieldName - Field name for error messages
 */
export const nullableEnumString = <T extends readonly string[]>(values: T, fieldName = 'Value') =>
  enumString(values, fieldName).nullable()

export const skipPagination = () =>
  z.enum(['true', 'false'], {
    error: 'skipPagination must be either true or false.',
  })
