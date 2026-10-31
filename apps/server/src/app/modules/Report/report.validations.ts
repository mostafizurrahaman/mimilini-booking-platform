import { z } from 'zod'

const getFullReportQuerySchema = z.object({
  query: z
    .object({
      year: z.preprocess((val) => (val !== undefined && val !== '' ? Number(val) : undefined), z.number().optional()),
      timeframe: z.enum(['daily', 'weekly', 'monthly', 'yearly']).optional(),
      month: z.preprocess((val) => (val !== undefined && val !== '' ? Number(val) : undefined), z.number().min(1).max(12).optional()),
    })
    .optional(),
})

const getUserGrowthQuerySchema = z.object({
  query: z
    .object({
      timeframe: z.enum(['daily', 'weekly', 'monthly', 'yearly']).optional(),
      year: z.preprocess((val) => (val !== undefined && val !== '' ? Number(val) : undefined), z.number().optional()),
      month: z.preprocess((val) => (val !== undefined && val !== '' ? Number(val) : undefined), z.number().min(1).max(12).optional()),
    })
    .optional(),
})

const getBookingAnalyticsQuerySchema = z.object({
  query: z
    .object({
      months: z.preprocess((val) => (val !== undefined && val !== '' ? Number(val) : undefined), z.number().min(1).max(24).optional()),
    })
    .optional(),
})

const getRevenueAnalyticsQuerySchema = z.object({
  query: z
    .object({
      year: z.preprocess((val) => (val !== undefined && val !== '' ? Number(val) : undefined), z.number().optional()),
    })
    .optional(),
})

const getTopArtistsQuerySchema = z.object({
  query: z
    .object({
      year: z.preprocess((val) => (val !== undefined && val !== '' ? Number(val) : undefined), z.number().optional()),
      limit: z.preprocess((val) => (val !== undefined && val !== '' ? Number(val) : undefined), z.number().min(1).max(50).optional()),
      page: z.preprocess((val) => (val !== undefined && val !== '' ? Number(val) : undefined), z.number().min(1).optional()),
    })
    .optional(),
})

const getPopularServicesQuerySchema = z.object({
  query: z
    .object({
      limit: z.preprocess((val) => (val !== undefined && val !== '' ? Number(val) : undefined), z.number().min(1).max(100).optional()),
      page: z.preprocess((val) => (val !== undefined && val !== '' ? Number(val) : undefined), z.number().min(1).optional()),
    })
    .optional(),
})

const exportReportQuerySchema = z.object({
  query: z
    .object({
      type: z.enum(['analytics', 'revenue', 'artists', 'services']).optional(),
      format: z.enum(['json', 'csv']).optional(),
      year: z.preprocess((val) => (val !== undefined && val !== '' ? Number(val) : undefined), z.number().optional()),
    })
    .optional(),
})

export const reportValidations = {
  getFullReportQuerySchema,
  getUserGrowthQuerySchema,
  getBookingAnalyticsQuerySchema,
  getRevenueAnalyticsQuerySchema,
  getTopArtistsQuerySchema,
  getPopularServicesQuerySchema,
  exportReportQuerySchema,
}

