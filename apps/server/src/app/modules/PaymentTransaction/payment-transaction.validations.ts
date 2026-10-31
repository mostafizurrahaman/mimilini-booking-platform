import { z } from 'zod'
import { PAYMENT_STATUS_VALUES, PAYMENT_TRANSACTION_TYPE_VALUES } from '@repo/db'

const getCustomerTransactionsQuerySchema = z.object({
  query: z.object({
    page: z.string().optional(),
    limit: z.string().optional(),
    status: z.enum(PAYMENT_STATUS_VALUES as [string, ...string[]]).optional(),
    type: z.enum(PAYMENT_TRANSACTION_TYPE_VALUES as [string, ...string[]]).optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    searchTerm: z.string().optional(),
  }),
})

const getArtistTransactionsQuerySchema = z.object({
  query: z.object({
    page: z.string().optional(),
    limit: z.string().optional(),
    status: z.enum(PAYMENT_STATUS_VALUES as [string, ...string[]]).optional(),
    type: z.enum(PAYMENT_TRANSACTION_TYPE_VALUES as [string, ...string[]]).optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    searchTerm: z.string().optional(),
  }),
})

export const paymentTransactionValidations = {
  getCustomerTransactionsQuerySchema,
  getArtistTransactionsQuerySchema,
}

