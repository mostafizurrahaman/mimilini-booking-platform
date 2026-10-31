import { z } from 'zod'

const getDashboardQuerySchema = z.object({
  query: z
    .object({
      timeframe: z.enum(['daily', 'weekly', 'monthly', 'yearly']).optional(),
    })
    .optional(),
})

const getRefundsQuerySchema = z.object({
  query: z
    .object({
      page: z.preprocess((val) => (val !== undefined && val !== '' ? Number(val) : undefined), z.number().optional()),
      limit: z.preprocess((val) => (val !== undefined && val !== '' ? Number(val) : undefined), z.number().optional()),
      status: z.enum(['all', 'pending', 'approved', 'rejected', 'processing']).optional(),
      dateRange: z.enum(['last_7_days', 'this_month', 'custom']).optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      searchTerm: z.string().optional(),
    })
    .optional(),
})

const refundActionSchema = z.object({
  body: z.object({
    action: z.enum(['approve', 'reject']),
    reason: z.string().trim().optional(),
    note: z.string().trim().optional(),
  }),
})

const getFinanceOverviewQuerySchema = z.object({
  query: z
    .object({
      timeframe: z.enum(['daily', 'weekly', 'monthly', 'yearly']).optional(),
      tab: z.enum(['booking_payments', 'refunds', 'commissions', 'withdrawals', 'failed']).optional(),
      page: z.preprocess((val) => (val !== undefined && val !== '' ? Number(val) : undefined), z.number().optional()),
      limit: z.preprocess((val) => (val !== undefined && val !== '' ? Number(val) : undefined), z.number().optional()),
      searchTerm: z.string().optional(),
    })
    .optional(),
})

const getReportsAnalyticsQuerySchema = z.object({
  query: z
    .object({
      year: z.preprocess((val) => (val !== undefined && val !== '' ? Number(val) : undefined), z.number().optional()),
      timeframe: z.enum(['daily', 'weekly', 'monthly', 'yearly']).optional(),
    })
    .optional(),
})

export const adminOperationsValidations = {
  getDashboardQuerySchema,
  getRefundsQuerySchema,
  refundActionSchema,
  getFinanceOverviewQuerySchema,
  getReportsAnalyticsQuerySchema,
}

