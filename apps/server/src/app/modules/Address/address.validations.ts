import z from 'zod'
import {
  requiredString,
  optionalNumber,
  optionalEnumString,
  optionalString,
  optionalDate,
  sortingOrderValues,
  enumString,
  requiredStrBoolean,
  requiredMongooseId,
  skipPagination,
} from '@repo/shared'
import { addressSortableFields, AddressTypeValues } from '@repo/db'

const createAddressSchema = z.object({
  body: z.object({
    type: enumString(AddressTypeValues, 'Address Type'),
    address: requiredString('Address'),
    latitude: z.coerce
      .number()
      .min(-90, 'Latitude must be between -90 and 90')
      .max(90, 'Latitude must be between -90 and 90'),
    longitude: z.coerce
      .number()
      .min(-180, 'Longitude must be between -180 and 180')
      .max(180, 'Longitude must be between -180 and 180'),
    apartmentOrUnit: optionalString('Apartment or unit no.'),
    city: requiredString('City'),
    state: requiredString('State'),
    postalCode: requiredString('Postal Code').regex(/^[0-9]{4}$/, { error: 'Invalid Postal code' }),
    country: requiredString('Country').default('Australia'),
    isDefault: requiredStrBoolean('Is Default').default(false).optional(),
  }),
})

const updateAddressSchema = z.object({
  params: z.object({
    id: requiredMongooseId('Address ID'),
  }),
  body: z.object({
    type: enumString(AddressTypeValues, 'Address Type').optional(),
    address: optionalString('Address'),
    latitude: z.coerce
      .number()
      .min(-90, 'Latitude must be between -90 and 90')
      .max(90, 'Latitude must be between -90 and 90')
      .optional(),
    longitude: z.coerce
      .number()
      .min(-180, 'Longitude must be between -180 and 180')
      .max(180, 'Longitude must be between -180 and 180')
      .optional(),
    apartmentOrUnit: optionalString('Apartment or unit no.').optional(),
    city: optionalString('City'),
    state: optionalString('State'),
    postalCode: optionalString('Postal Code')
      .refine((val) => !val || /^[0-9]{4}$/.test(val), { message: 'Invalid Postal code' })
      .optional(),
    country: optionalString('Country'),
    isDefault: requiredStrBoolean('Is Default').optional(),
  }),
})

const setDefaultAddressSchema = z.object({
  params: z.object({
    id: requiredMongooseId('Address ID'),
  }),
})

const getAllAddressSchema = z.object({
  query: z.object({
    page: optionalNumber('Page'),
    limit: optionalNumber('Limit'),
    searchTerm: optionalString('Search term'),
    sortOrder: optionalEnumString(sortingOrderValues, 'Sort order'),
    type: optionalEnumString(AddressTypeValues, 'Address Type'),
    sortBy: optionalEnumString(addressSortableFields, 'Sort by'),
    fromDate: optionalDate('From date'),
    toDate: optionalDate('To date'),
    skipPagination: skipPagination().optional(),
  }),
})

const getAddressByIdSchema = z.object({
  params: z.object({
    id: requiredMongooseId('Address ID'),
  }),
})

const deleteAddressByIdSchema = z.object({
  params: z.object({
    id: requiredMongooseId('Address ID'),
  }),
})

export const addressValidations = {
  createAddressSchema,
  updateAddressSchema,
  setDefaultAddressSchema,
  getAllAddressSchema,
  getAddressByIdSchema,
  deleteAddressByIdSchema,
}

export type TCreateAddressPayloadType = z.infer<typeof createAddressSchema.shape.body>
export type TUpdateAddressPayloadType = z.infer<typeof updateAddressSchema.shape.body>
export type TGetAllAddressQueryParamsType = z.infer<typeof getAllAddressSchema.shape.query>
export type TGetAddressByIdParamsType = z.infer<typeof getAddressByIdSchema.shape.params>
export type TDeleteAddressByIdParamsType = z.infer<typeof deleteAddressByIdSchema.shape.params>
