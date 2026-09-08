import z from 'zod'
import {
  requiredString,
  optionalNumber,
  optionalEnumString,
  optionalString,
  optionalDate,
  sortingOrderValues,
} from '@repo/shared'
import { faqSortableFields } from '@repo/db'

const createFaqSchema = z.object({
  body: z.object({
    question: requiredString('Question'),
    answer: requiredString('Answer'),
  }),
})

const updateFaqSchema = z.object({
  params: z.object({
    id: requiredString('ID'),
  }),
  body: z.object({
    question: requiredString('Question'),
    answer: requiredString('Answer'),
  }),
})

const getAllFaqSchema = z.object({
  query: z.object({
    page: optionalNumber('Page'),
    limit: optionalNumber('Limit'),
    searchTerm: optionalString('Search term'),
    sortOrder: optionalEnumString(sortingOrderValues, 'Sort order'),
    sortBy: optionalEnumString(faqSortableFields, 'Sort by'),
    fromDate: optionalDate('From date'),
    toDate: optionalDate('To date'),
  }),
})

const getFaqByIdSchema = z.object({
  params: z.object({
    id: requiredString('ID'),
  }),
})

const deleteFaqByIdSchema = z.object({
  params: z.object({
    id: requiredString('ID'),
  }),
})

export const faqValidations = {
  createFaqSchema,
  updateFaqSchema,
  getAllFaqSchema,
  getFaqByIdSchema,
  deleteFaqByIdSchema,
}

export type TCreateFaqPayloadType = z.infer<typeof createFaqSchema.shape.body>
export type TUpdateFaqPayloadType = z.infer<typeof updateFaqSchema.shape.body>
export type TGetAllFaqQueryParamsType = z.infer<typeof getAllFaqSchema.shape.query>
export type TGetFaqByIdParamsType = z.infer<typeof getFaqByIdSchema.shape.params>
export type TDeleteFaqByIdParamsType = z.infer<typeof deleteFaqByIdSchema.shape.params>
