import { z } from 'zod'
import { BUG_STATUS_VALUES } from '@repo/db'

const createBugReportSchema = z.object({
  body: z.object({
    title: z.string().min(3, 'Title must be at least 3 characters long'),
    description: z.string().min(5, 'Description must be at least 5 characters long'),
    booking: z.string().optional(),
    attachments: z.array(z.string()).optional(),
    deviceInfo: z.string().optional(),
  }),
})

const updateBugStatusSchema = z.object({
  body: z.object({
    status: z.enum(BUG_STATUS_VALUES as [string, ...string[]]),
    adminNote: z.string().optional(),
  }),
})

const getBugReportsQuerySchema = z.object({
  query: z
    .object({
      status: z.enum(BUG_STATUS_VALUES as [string, ...string[]]).optional(),
      searchTerm: z.string().optional(),
      page: z.preprocess((val) => (val !== undefined && val !== '' ? Number(val) : undefined), z.number().min(1).optional()),
      limit: z.preprocess((val) => (val !== undefined && val !== '' ? Number(val) : undefined), z.number().min(1).max(100).optional()),
    })
    .optional(),
})

export const bugReportValidations = {
  createBugReportSchema,
  updateBugStatusSchema,
  getBugReportsQuerySchema,
}

