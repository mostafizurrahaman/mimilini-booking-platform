import httpStatus from 'http-status'
import { AppError } from '@repo/shared'
import {
  checkEmailExistsInSheet,
  appendWaitlistToSheet,
  getAllWaitlistFromSheet,
} from '@app/libs/google-sheets'
import type { TCreateWaitlistPayload, TGetAllWaitlistQuery } from './waitlist.validations'

/**
 * Creates a waitlist entry in the Google Spreadsheet, verifying that duplicate emails are rejected.
 */
const createWaitlist = async (payload: TCreateWaitlistPayload) => {
  const normalizedEmail = payload.email.trim().toLowerCase()

  // 1. Check for duplicate email in the Google Spreadsheet
  const isDuplicate = await checkEmailExistsInSheet(normalizedEmail)

  if (isDuplicate) {
    throw new AppError(httpStatus.CONFLICT, 'This email is already registered in the waitlist.')
  }

  // 2. Append new record into Google Spreadsheet
  const result = await appendWaitlistToSheet({
    email: normalizedEmail,
    role: payload.role.trim(),
    address: payload.address.trim(),
  })

  return result
}

/**
 * Retrieves all waitlist entries directly from the Google Spreadsheet with optional search and pagination.
 */
const getAllWaitlist = async (query: TGetAllWaitlistQuery) => {
  const { page = 1, limit = 10, searchTerm } = query

  const allEntries = await getAllWaitlistFromSheet()

  let filtered = allEntries

  if (searchTerm) {
    const term = searchTerm.toLowerCase().trim()
    filtered = allEntries.filter(
      (entry) =>
        entry.email.toLowerCase().includes(term) ||
        entry.role.toLowerCase().includes(term) ||
        entry.address.toLowerCase().includes(term)
    )
  }

  const total = filtered.length
  const skip = (page - 1) * limit
  const data = filtered.slice(skip, skip + limit)

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

export const waitlistServices = {
  createWaitlist,
  getAllWaitlist,
}
