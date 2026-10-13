import z from 'zod'
import { requiredEmail, requiredString, optionalString, optionalNumber } from '@repo/shared'

const createWaitlistSchema = z.object({
  body: z.object({
    email: requiredEmail('Email'),
    role: requiredString('Role'),
    address: requiredString('Address'),
  }),
})

const getAllWaitlistSchema = z.object({
  query: z.object({
    page: optionalNumber('Page'),
    limit: optionalNumber('Limit'),
    searchTerm: optionalString('Search term'),
  }),
})

export const waitlistValidations = {
  createWaitlistSchema,
  getAllWaitlistSchema,
}

export type TCreateWaitlistPayload = z.infer<typeof createWaitlistSchema.shape.body>
export type TGetAllWaitlistQuery = z.infer<typeof getAllWaitlistSchema.shape.query>
