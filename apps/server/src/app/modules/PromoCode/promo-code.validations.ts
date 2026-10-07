import z from 'zod'
import {
  requiredString,
  optionalNumber,
  optionalEnumString,
  optionalString,
  optionalDate,
  sortingOrderValues,
  positiveNumber,
  enumString,
  requiredDate,
} from '@repo/shared'
import { DISCOUNT_TYPE_VALUES, promoCodeSortableFields } from '@repo/db'

import moment from 'moment'

const createPromoCodeSchema = z.object({
  body: z
    .object({
      promotionName: requiredString('Promotion Name'),

      promoCode: requiredString('Promo Code'),

      minBookingValue: positiveNumber('Min Booking Amount').min(
        1,
        'Minimum booking amount must be greater than 0.'
      ),

      usageLimit: positiveNumber('Usage Limit').min(1, 'Usage limit must be greater than 0.'),

      discountType: enumString(DISCOUNT_TYPE_VALUES, 'Discount Type'),

      discountValue: positiveNumber('Discount Value').min(
        1,
        'Discount value must be greater than 0.'
      ),

      startDate: requiredDate('Start Date'),

      endDate: requiredDate('End Date'),
    })
    .superRefine((data, ctx) => {
      // Discount value should be less than minimum booking value
      if (data.discountValue >= data.minBookingValue) {
        ctx.addIssue({
          code: 'custom',
          path: ['discountValue'],
          message: 'Discount value must be less than the minimum booking amount.',
        })
      }

      const today = moment()
      const startDate = moment(data.startDate)
      const endDate = moment(data.endDate)

      // Start date must be in the future
      if (!startDate.isAfter(today)) {
        ctx.addIssue({
          code: 'custom',
          path: ['startDate'],
          message: 'Start date must be a future date.',
        })
      }

      // End date must be after start date
      if (!endDate.isAfter(startDate)) {
        ctx.addIssue({
          code: 'custom',
          path: ['endDate'],
          message: 'End date must be after the start date.',
        })
      }
    }),
})

const updatePromoCodeSchema = z.object({
  params: z.object({
    id: requiredString('ID'),
  }),
  body: z.object({}),
})

const getAllPromoCodeSchema = z.object({
  query: z.object({
    page: optionalNumber('Page'),
    limit: optionalNumber('Limit'),
    searchTerm: optionalString('Search term'),
    sortOrder: optionalEnumString(sortingOrderValues, 'Sort order'),
    sortBy: optionalEnumString(promoCodeSortableFields, 'Sort by'),
    fromDate: optionalDate('From date'),
    toDate: optionalDate('To date'),
  }),
})

const getPromoCodeByIdSchema = z.object({
  params: z.object({
    id: requiredString('ID'),
  }),
})

const deletePromoCodeByIdSchema = z.object({
  params: z.object({
    id: requiredString('ID'),
  }),
})

export const promoCodeValidations = {
  createPromoCodeSchema,
  updatePromoCodeSchema,
  getAllPromoCodeSchema,
  getPromoCodeByIdSchema,
  deletePromoCodeByIdSchema,
}

export type TCreatePromoCodePayloadType = z.infer<typeof createPromoCodeSchema.shape.body>
export type TUpdatePromoCodePayloadType = z.infer<typeof updatePromoCodeSchema.shape.body>
export type TGetAllPromoCodeQueryParamsType = z.infer<typeof getAllPromoCodeSchema.shape.query>
export type TGetPromoCodeByIdParamsType = z.infer<typeof getPromoCodeByIdSchema.shape.params>
export type TDeletePromoCodeByIdParamsType = z.infer<typeof deletePromoCodeByIdSchema.shape.params>
