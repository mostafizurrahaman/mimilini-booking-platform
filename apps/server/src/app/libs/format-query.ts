import httpStatus from 'http-status'
import { AppError } from '@repo/shared'
import type { PipelineStage } from 'mongoose'

export const formatQuery = (query: Record<string, unknown>, sortableFields: string[]) => {
  const {
    limit,
    page,
    searchTerm,
    sortOrder = 'desc',
    sortBy = 'createdAt',
    fromDate,
    toDate,
  } = query

  // Pagination
  const currentLimit = Math.min(Math.max(Number(limit) || 10, 1), 100)

  const currentPage = Math.max(Number(page) || 1, 1)

  const skip = (currentPage - 1) * currentLimit

  // Sorting
  const sortField = String(sortBy)
  const normalizedSortOrder = String(sortOrder).toLowerCase()

  if (!sortableFields.includes(sortField)) {
    throw new AppError(httpStatus.BAD_REQUEST, `Sorting by "${sortField}" is not allowed.`)
  }

  if (!['asc', 'desc'].includes(normalizedSortOrder)) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Sort order must be either "asc" or "desc".')
  }

  const sortOrderValue = normalizedSortOrder === 'asc' ? 1 : -1

  // Date filters
  const startDate = fromDate ? new Date(String(fromDate)) : undefined
  const endDate = toDate ? new Date(String(toDate)) : undefined

  if (startDate && Number.isNaN(startDate.getTime())) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Invalid fromDate.')
  }

  if (endDate && Number.isNaN(endDate.getTime())) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Invalid toDate.')
  }

  return {
    page: currentPage,
    limit: currentLimit,
    skip,

    searchTerm: searchTerm ? String(searchTerm).trim() : undefined,

    fromDate: startDate,
    toDate: endDate,

    sortBy: sortField,
    sortOrder: sortOrderValue as 1 | -1,
  }
}
