import z from 'zod'
import {
  requiredString,
  optionalNumber,
  optionalEnumString,
  optionalString,
  optionalDate,
  sortingOrderValues,
  requiredMongooseId,
} from '@repo/shared'
import { beautyPreferencesSortableFields } from '@repo/db'

const createBeautyPreferencesSchema = z.object({
  body: z.object({
    category: requiredMongooseId('Category'),
  }),
})

const updateBeautyPreferencesSchema = z.object({
  params: z.object({
    id: requiredString('ID'),
  }),
  body: z.object({}),
})

const getMyAllBeautyPreferencesSchema = z.object({
  query: z.object({
    page: optionalNumber('Page'),
    limit: optionalNumber('Limit'),
    searchTerm: optionalString('Search term'),
    sortOrder: optionalEnumString(sortingOrderValues, 'Sort order'),
    sortBy: optionalEnumString(beautyPreferencesSortableFields, 'Sort by'),
    fromDate: optionalDate('From date'),
    customer: requiredMongooseId('Customer').optional(),
    toDate: optionalDate('To date'),
  }),
})

const getBeautyPreferencesByIdSchema = z.object({
  params: z.object({
    id: requiredString('ID'),
  }),
})

const deleteBeautyPreferencesByIdSchema = z.object({
  body: z.object({
    category: requiredMongooseId('Category'),
  }),
})

export const beautyPreferencesValidations = {
  createBeautyPreferencesSchema,
  updateBeautyPreferencesSchema,
  getMyAllBeautyPreferencesSchema,
  getBeautyPreferencesByIdSchema,
  deleteBeautyPreferencesByIdSchema,
}

export type TCreateBeautyPreferencesPayloadType = z.infer<
  typeof createBeautyPreferencesSchema.shape.body
>
export type TUpdateBeautyPreferencesPayloadType = z.infer<
  typeof updateBeautyPreferencesSchema.shape.body
>
export type TGetMyAllBeautyPreferencesQueryParamsType = z.infer<
  typeof getMyAllBeautyPreferencesSchema.shape.query
>
export type TGetBeautyPreferencesByIdParamsType = z.infer<
  typeof getBeautyPreferencesByIdSchema.shape.params
>
export type TDeleteBeautyPreferencesByIdPayloadType = z.infer<
  typeof deleteBeautyPreferencesByIdSchema.shape.body
>
