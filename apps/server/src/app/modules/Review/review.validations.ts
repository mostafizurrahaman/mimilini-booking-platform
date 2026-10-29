import { z } from 'zod'
import { ADMIN_REVIEW_ACTION_VALUES, MAX_RATING, MIN_RATING } from '@repo/db'

const parseStringArray = (val: unknown): string[] | undefined => {
  if (val === undefined || val === null || val === '') return undefined
  if (Array.isArray(val)) {
    return val.map((item) => String(item).trim()).filter(Boolean)
  }
  if (typeof val === 'string') {
    const trimmed = val.trim()
    if (!trimmed) return []
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed)
        if (Array.isArray(parsed)) {
          return parsed.map((item) => String(item).trim()).filter(Boolean)
        }
      } catch {
        // fallback to comma-separated
      }
    }
    return trimmed
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  }
  return undefined
}

const createReviewSchema = z.object({
  body: z.object({
    bookingId: z.string().trim().min(1, 'bookingId is required'),
    rating: z.preprocess(
      (val) => (val !== undefined && val !== '' ? Number(val) : val),
      z
        .number({ message: 'Rating is required and must be a number between 1 and 5' })
        .min(MIN_RATING, 'Rating must be at least 1')
        .max(MAX_RATING, 'Rating cannot exceed 5')
    ),
    tags: z.preprocess(parseStringArray, z.array(z.string()).max(10).optional()),
    comment: z
      .string()
      .trim()
      .max(500, 'Written review cannot exceed 500 characters')
      .optional(),
    beforeImage: z.string().trim().optional(),
    afterImage: z.string().trim().optional(),
    images: z.preprocess(parseStringArray, z.array(z.string()).max(6).optional()),
  }),
})

const replyReviewSchema = z.object({
  params: z.object({
    id: z.string().trim().min(1, 'Review ID is required'),
  }),
  body: z.object({
    comment: z
      .string()
      .trim()
      .min(1, 'Reply comment is required')
      .max(500, 'Reply cannot exceed 500 characters'),
  }),
})

const reportReviewSchema = z.object({
  params: z.object({
    id: z.string().trim().min(1, 'Review ID is required'),
  }),
  body: z.object({
    reason: z
      .string()
      .trim()
      .min(1, 'Reason is required to report a review')
      .max(500, 'Reason cannot exceed 500 characters'),
    isFakeReview: z.boolean().optional().default(true),
  }),
})

const adminModerationActionSchema = z.object({
  params: z.object({
    id: z.string().trim().min(1, 'Review ID is required'),
  }),
  body: z.object({
    action: z.enum(ADMIN_REVIEW_ACTION_VALUES as [string, ...string[]]),
    note: z.string().trim().max(500).optional(),
  }),
})

const getCustomerStoriesQuerySchema = z.object({
  query: z.object({
    page: z.string().optional(),
    limit: z.string().optional(),
    featuredOnly: z.string().optional(),
    serviceName: z.string().optional(),
    searchTerm: z.string().optional(),
  }),
})

const getAdminModerationQuerySchema = z.object({
  query: z.object({
    tab: z
      .enum(['all', 'reported', 'fake', 'pending', 'resolved', 'hidden'])
      .optional()
      .default('all'),
    sortBy: z
      .enum(['newest', 'lowest_rating', 'highest_rating'])
      .optional()
      .default('newest'),
    searchTerm: z.string().optional(),
    page: z.string().optional(),
    limit: z.string().optional(),
  }),
})

export const reviewValidations = {
  createReviewSchema,
  replyReviewSchema,
  reportReviewSchema,
  adminModerationActionSchema,
  getCustomerStoriesQuerySchema,
  getAdminModerationQuerySchema,
}

