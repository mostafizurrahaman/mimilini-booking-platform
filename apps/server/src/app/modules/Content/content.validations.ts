import z from 'zod'
import {
  requiredString,
  optionalNumber,
  optionalEnumString,
  optionalString,
  optionalDate,
  sortingOrderValues,
  enumString,
} from '@repo/shared'
import { contentSortableFields, contentTypeValues } from '@repo/db'

const updateContentSchema = z.object({
  params: z.object({
    type: enumString(contentTypeValues, 'Content Type'),
  }),
  body: z.object({
    content: requiredString('Content'),
  }),
})

const getAllContentSchema = z.object({
  query: z.object({
    page: optionalNumber('Page'),
    limit: optionalNumber('Limit'),
    searchTerm: optionalString('Search term'),
    sortOrder: optionalEnumString(sortingOrderValues, 'Sort order'),
    sortBy: optionalEnumString(contentSortableFields, 'Sort by'),
    fromDate: optionalDate('From date'),
    toDate: optionalDate('To date'),
  }),
})

const getContentByIdSchema = z.object({
  params: z.object({
    type: enumString(contentTypeValues, 'Content Type'),
  }),
})

const deleteContentByIdSchema = z.object({
  params: z.object({
    id: requiredString('ID'),
  }),
})

export const contentValidations = {
  updateContentSchema,
  getAllContentSchema,
  getContentByIdSchema,
  deleteContentByIdSchema,
}

export type TUpdateContentPayloadType = z.infer<typeof updateContentSchema.shape.body>
export type TGetAllContentQueryParamsType = z.infer<typeof getAllContentSchema.shape.query>
export type TGetContentByIdParamsType = z.infer<typeof getContentByIdSchema.shape.params>
export type TDeleteContentByIdParamsType = z.infer<typeof deleteContentByIdSchema.shape.params>
