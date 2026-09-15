import moment from 'moment'
import momentTz from 'moment-timezone'

/**
 * Get current timestamp
 * @param {boolean} utc - If true, returns UTC time
 * @returns {Date}
 */
export const now = (utc = false): Date => {
  return utc ? moment.utc().toDate() : moment().toDate()
}

/**
 * Add time to current date
 * @param {number} value - Amount to add
 * @param {'seconds'|'minutes'|'hours'|'days'|'months'|'years'} unit - Unit type
 * @param {boolean} utc - If true, adds in UTC
 * @returns {Date}
 */
export const addTime = (
  value: number,
  unit: 'seconds' | 'minutes' | 'hours' | 'days' | 'months' | 'years',
  utc = false
): Date => {
  const m = utc ? moment.utc() : moment()
  return m.add(value, unit).toDate()
}

/**
 * Subtract time from current date
 * @param {number} value - Amount to subtract
 * @param {'seconds'|'minutes'|'hours'|'days'|'months'|'years'} unit - Unit type
 * @param {boolean} utc - If true, subtracts in UTC
 * @returns {Date}
 */
export const subtractTime = (
  value: number,
  unit: 'seconds' | 'minutes' | 'hours' | 'days' | 'months' | 'years',
  utc = false
): Date => {
  const m = utc ? moment.utc() : moment()
  return m.subtract(value, unit).toDate()
}

/**
 * Format a date
 * @param {Date} date - Date object to format
 * @param {string} format - Moment.js format string (default: ISO 8601)
 * @param {boolean} utc - Format in UTC if true
 * @returns {string}
 */
export const formatDate = (date: Date, format = 'YYYY-MM-DD HH:mm:ss', utc = false): string => {
  return utc ? moment.utc(date).format(format) : moment(date).format(format)
}

/**
 * Check if a date has expired
 * @param {Date} date - Date to check
 * @returns {boolean} true if date is in the past
 */
export const isExpired = (date: Date): boolean => {
  return moment().isAfter(moment(date))
}

export const isValidTimeZone = (timezone: string): boolean => {
  return momentTz?.tz?.zone(timezone) !== null
}

export const DATE_ONLY_FORMAT = 'YYYY-MM-DD'

export const isValidDateOnly = (value: string): boolean => {
  return moment(value, DATE_ONLY_FORMAT, true).isValid()
}

/**
 * Normalize a date input to a calendar date string (YYYY-MM-DD).
 * If the value already starts with YYYY-MM-DD, that calendar date is kept
 * so timezone conversion cannot shift the stored day.
 */
export const toDateOnly = (value: string | Date): string => {
  if (typeof value === 'string') {
    const match = value.trim().match(/^(\d{4}-\d{2}-\d{2})/)
    if (match?.[1] && isValidDateOnly(match[1])) {
      return match[1]
    }
  }

  const parsed = moment(value)
  if (!parsed.isValid()) {
    throw new Error('Invalid date')
  }

  return parsed.format(DATE_ONLY_FORMAT)
}
