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
import {
  DISCOUNT_STATUS_VALUES,
  DISCOUNT_TYPE_VALUES,
  promoCodeSortableFields,
} from '@repo/db'
import moment from 'moment'

const createPromoCodeSchema = z.object({
  body: z
    .object({
      promotionName: requiredString('Promotion Name'),

      promoCode: requiredString('Promo Code').regex(
        /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/,
        'Promo Code can only contain uppercase letters, numbers, and hyphens.'
      ),

      minBookingValue: optionalNumber('Min Booking Amount').default(0),

      usageLimit: positiveNumber('Usage Limit').min(1, 'Usage limit must be at least 1.'),

      discountType: enumString(DISCOUNT_TYPE_VALUES, 'Discount Type'),

      discountValue: positiveNumber('Discount Value').min(
        1,
        'Discount value must be greater than 0.'
      ),

      maxDiscountAmount: optionalNumber('Max Discount Amount'),

      startDate: requiredDate('Start Date'),

      endDate: requiredDate('End Date'),

      status: optionalEnumString(DISCOUNT_STATUS_VALUES, 'Status'),
    })
    .superRefine((data, ctx) => {
      const today = moment().startOf('day')
      const startDate = moment(data.startDate)
      const endDate = moment(data.endDate)

      // Start date must be today or in the future
      if (startDate.isBefore(today)) {
        ctx.addIssue({
          code: 'custom',
          path: ['startDate'],
          message: 'Start date cannot be in the past.',
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

      // Percentage discount cannot exceed 100%
      if (data.discountType === 'percentage' && data.discountValue > 100) {
        ctx.addIssue({
          code: 'custom',
          path: ['discountValue'],
          message: 'Percentage discount cannot exceed 100%.',
        })
      }
    }),
})

const updatePromoCodeSchema = z.object({
  params: z.object({
    id: requiredString('ID'),
  }),
  body: z
    .object({
      promotionName: optionalString('Promotion Name'),

      promoCode: optionalString('Promo Code').refine(
        (val) => !val || /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(val),
        { message: 'Promo Code can only contain uppercase letters, numbers, and hyphens.' }
      ),

      minBookingValue: optionalNumber('Min Booking Amount'),

      usageLimit: optionalNumber('Usage Limit'),

      discountType: optionalEnumString(DISCOUNT_TYPE_VALUES, 'Discount Type'),

      discountValue: optionalNumber('Discount Value'),

      maxDiscountAmount: optionalNumber('Max Discount Amount'),

      startDate: optionalDate('Start Date'),

      endDate: optionalDate('End Date'),

      status: optionalEnumString(DISCOUNT_STATUS_VALUES, 'Status'),
    })
    .superRefine((data, ctx) => {
      if (data.startDate && data.endDate) {
        const startDate = moment(data.startDate)
        const endDate = moment(data.endDate)

        // End date must be after start date
        if (!endDate.isAfter(startDate)) {
          ctx.addIssue({
            code: 'custom',
            path: ['endDate'],
            message: 'End date must be after the start date.',
          })
        }
      }

      if (
        data.discountType === 'percentage' &&
        data.discountValue !== undefined &&
        data.discountValue > 100
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['discountValue'],
          message: 'Percentage discount cannot exceed 100%.',
        })
      }
    }),
})

const updatePromoCodeStatusSchema = z.object({
  params: z.object({
    id: requiredString('ID'),
  }),
  body: z.object({
    status: enumString(DISCOUNT_STATUS_VALUES, 'Status'),
  }),
})

const validatePromoCodeSchema = z.object({
  body: z.object({
    promoCode: requiredString('Promo Code'),
    bookingAmount: positiveNumber('Booking Amount').min(
      0.01,
      'Booking amount must be greater than 0.'
    ),
    artistId: optionalString('Artist ID'),
  }),
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
    status: optionalEnumString(DISCOUNT_STATUS_VALUES, 'Status'),
    discountType: optionalEnumString(DISCOUNT_TYPE_VALUES, 'Discount Type'),
    isAdminOffer: optionalString('Is Admin Offer'),
    author: optionalString('Author ID'),
  }),
})

const getMyPromoCodesSchema = z.object({
  query: z.object({
    page: optionalNumber('Page'),
    limit: optionalNumber('Limit'),
    searchTerm: optionalString('Search term'),
    sortOrder: optionalEnumString(sortingOrderValues, 'Sort order'),
    sortBy: optionalEnumString(promoCodeSortableFields, 'Sort by'),
    fromDate: optionalDate('From date'),
    toDate: optionalDate('To date'),
    status: optionalEnumString(DISCOUNT_STATUS_VALUES, 'Status'),
    discountType: optionalEnumString(DISCOUNT_TYPE_VALUES, 'Discount Type'),
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
  updatePromoCodeStatusSchema,
  validatePromoCodeSchema,
  getAllPromoCodeSchema,
  getMyPromoCodesSchema,
  getPromoCodeByIdSchema,
  deletePromoCodeByIdSchema,
}

export type TCreatePromoCodePayloadType = z.infer<typeof createPromoCodeSchema.shape.body>
export type TUpdatePromoCodePayloadType = z.infer<typeof updatePromoCodeSchema.shape.body>
export type TUpdatePromoCodeStatusPayloadType = z.infer<typeof updatePromoCodeStatusSchema.shape.body>
export type TValidatePromoCodePayloadType = z.infer<typeof validatePromoCodeSchema.shape.body>
export type TGetAllPromoCodeQueryParamsType = z.infer<typeof getAllPromoCodeSchema.shape.query>
export type TGetMyPromoCodesQueryParamsType = z.infer<typeof getMyPromoCodesSchema.shape.query>
export type TGetPromoCodeByIdParamsType = z.infer<typeof getPromoCodeByIdSchema.shape.params>
export type TDeletePromoCodeByIdParamsType = z.infer<typeof deletePromoCodeByIdSchema.shape.params>
