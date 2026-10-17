import z from 'zod'
import {
  requiredString,
  optionalNumber,
  optionalEnumString,
  optionalString,
  optionalDate,
  sortingOrderValues,
  requiredStrBoolean,
} from '@repo/shared'
import { paymentMethodSortableFields } from '@repo/db'

const addPaymentMethodSchema = z.object({
  body: z.object({
    paymentMethodId: requiredString('Payment method ID'),
    isDefault: requiredStrBoolean('Is Default'),
  }),
})

const markAsDefaultSchema = z.object({
  params: z.object({
    id: requiredString('ID'),
  }),
})

const getAllPaymentMethodSchema = z.object({
  query: z.object({
    page: optionalNumber('Page'),
    limit: optionalNumber('Limit'),
    searchTerm: optionalString('Search term'),
    sortOrder: optionalEnumString(sortingOrderValues, 'Sort order'),
    sortBy: optionalEnumString(paymentMethodSortableFields, 'Sort by'),
    fromDate: optionalDate('From date'),
    toDate: optionalDate('To date'),
  }),
})

const getPaymentMethodByIdSchema = z.object({
  params: z.object({
    id: requiredString('ID'),
  }),
})

const deletePaymentMethodByIdSchema = z.object({
  params: z.object({
    id: requiredString('ID'),
  }),
})

export const paymentMethodValidations = {
  addPaymentMethodSchema,
  markAsDefaultSchema,
  getAllPaymentMethodSchema,
  getPaymentMethodByIdSchema,
  deletePaymentMethodByIdSchema,
}

export type TAddPaymentMethodPayloadType = z.infer<typeof addPaymentMethodSchema.shape.body>
export type TMarkAsDefaultPayloadType = z.infer<typeof markAsDefaultSchema.shape.params>
export type TGetAllPaymentMethodQueryParamsType = z.infer<
  typeof getAllPaymentMethodSchema.shape.query
>
export type TGetPaymentMethodByIdParamsType = z.infer<
  typeof getPaymentMethodByIdSchema.shape.params
>
export type TDeletePaymentMethodByIdParamsType = z.infer<
  typeof deletePaymentMethodByIdSchema.shape.params
>
