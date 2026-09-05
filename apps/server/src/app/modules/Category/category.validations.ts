import z from 'zod'
import {
  requiredString,
  optionalNumber,
  optionalEnumString,
  optionalString,
  optionalDate,
  sortingOrderValues,
  sortOrder,
} from '@repo/shared'
import { categorySortableFields } from '@repo/db'

const createCategorySchema = z.object({
  body: z.object({
    name: requiredString('Name'),
    description: optionalString('Description'),
    isActive: z.coerce
      .boolean({
        error: 'Is active should be boolean.',
      })
      .default(true),
  }),
})

const updateCategorySchema = z.object({
  params: z.object({
    id: requiredString('ID'),
  }),
  body: createCategorySchema.shape.body.partial(),
})

const getAllCategorySchema = z.object({
  query: z.object({
    page: optionalNumber('Page'),
    limit: optionalNumber('Limit'),
    searchTerm: optionalString('Search term'),
    sortOrder: optionalEnumString(sortingOrderValues, 'Sort order'),
    sortBy: optionalEnumString(categorySortableFields, 'Sort by'),
    isActive: z.coerce
      .boolean({
        error: 'isActive should be boolean',
      })
      .optional(),
    fromDate: optionalDate('From date'),
    toDate: optionalDate('To date'),
  }),
})

const getCategoryByIdSchema = z.object({
  params: z.object({
    id: requiredString('ID'),
  }),
})

const deleteCategoryByIdSchema = z.object({
  params: z.object({
    id: requiredString('ID'),
  }),
})

export const categoryValidations = {
  createCategorySchema,
  updateCategorySchema,
  getAllCategorySchema,
  getCategoryByIdSchema,
  deleteCategoryByIdSchema,
}

export type TCreateCategoryPayloadType = z.infer<typeof createCategorySchema.shape.body>
export type TUpdateCategoryPayloadType = z.infer<typeof updateCategorySchema.shape.body>
export type TGetAllCategoryQueryParamsType = z.infer<typeof getAllCategorySchema.shape.query>
export type TGetCategoryByIdParamsType = z.infer<typeof getCategoryByIdSchema.shape.params>
export type TDeleteCategoryByIdParamsType = z.infer<typeof deleteCategoryByIdSchema.shape.params>
