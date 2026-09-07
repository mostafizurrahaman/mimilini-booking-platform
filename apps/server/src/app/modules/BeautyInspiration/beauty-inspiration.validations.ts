import z from 'zod'
import {
  requiredString,
  optionalNumber,
  optionalEnumString,
  optionalString,
  optionalDate,
  sortingOrderValues,
} from '@repo/shared'
import { beautyInspirationSortableFields } from '@repo/db'

const createBeautyInspirationSchema = z.object({
  body: z.object({
    tags: z
      .array(requiredString('Tag'), {
        error: 'Tags is required.',
      })
      .min(1, { error: 'Min. one tag is required' }),
  }),
})

const updateBeautyInspirationSchema = z.object({
  params: z.object({
    id: requiredString('ID'),
  }),
  body: z.object({
    tags: z
      .array(requiredString('Tag'), {
        error: 'Tags is required.',
      })
      .min(1, { error: 'Min. one tag is required' })
      .optional(),
  }),
})

const getAllBeautyInspirationSchema = z.object({
  query: z.object({
    page: optionalNumber('Page'),
    limit: optionalNumber('Limit'),
    searchTerm: optionalString('Search term'),
    sortOrder: optionalEnumString(sortingOrderValues, 'Sort order'),
    sortBy: optionalEnumString(beautyInspirationSortableFields, 'Sort by'),
    fromDate: optionalDate('From date'),
    toDate: optionalDate('To date'),
  }),
})

const getBeautyInspirationByIdSchema = z.object({
  params: z.object({
    id: requiredString('ID'),
  }),
})

const deleteBeautyInspirationByIdSchema = z.object({
  params: z.object({
    id: requiredString('ID'),
  }),
})

export const beautyInspirationValidations = {
  createBeautyInspirationSchema,
  updateBeautyInspirationSchema,
  getAllBeautyInspirationSchema,
  getBeautyInspirationByIdSchema,
  deleteBeautyInspirationByIdSchema,
}

export type TCreateBeautyInspirationPayloadType = z.infer<
  typeof createBeautyInspirationSchema.shape.body
>
export type TUpdateBeautyInspirationPayloadType = z.infer<
  typeof updateBeautyInspirationSchema.shape.body
>
export type TGetAllBeautyInspirationQueryParamsType = z.infer<
  typeof getAllBeautyInspirationSchema.shape.query
>
export type TGetBeautyInspirationByIdParamsType = z.infer<
  typeof getBeautyInspirationByIdSchema.shape.params
>
export type TDeleteBeautyInspirationByIdParamsType = z.infer<
  typeof deleteBeautyInspirationByIdSchema.shape.params
>
