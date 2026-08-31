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
  requiredNumber,
} from '@repo/shared'
import { artistProfileSortableFields } from '@repo/db'

const createArtistProfileSchema = z.object({
  body: z.object({
    businessName: requiredString('Business name'),
    phone: requiredString('Phone').regex(
      /^(?:(?:\+61|0061)\s?4\d{2}\s?\d{3}\s?\d{3}|0[2-8]\s?\d{4}\s?\d{4})$/,
      'Invalid Australian phone number'
    ),
    abn: requiredString('ABN (Australian business number) is required.').regex(
      /^\d{2}\s\d{3}\s\d{3}\s\d{3}$/,
      {
        error: 'Invalid ABN.',
      }
    ),
    businessAddress: requiredString('Business address'),
    yearOfExperience: positiveNumber('Years of experience'),
    professionalBio: optionalString('Professional bio'),
    latitude: z.coerce
      .number()
      .min(-90, 'Latitude must be between -90 and 90')
      .max(90, 'Latitude must be between -90 and 90'),
    longitude: z.coerce
      .number()
      .min(-180, 'Longitude must be between -180 and 180')
      .max(180, 'Longitude must be between -180 and 180'),
    city: requiredString('City'),
    state: requiredString('State'),
    postalCode: requiredString('Postal Code').regex(/^[0-9]{4}$/, { error: 'Invalid Postal code' }),
    website: optionalString('Website').nullable(),
    instagram: requiredString('Instagram username')
      .regex(/^[a-zA-Z0-9._]{1,30}$/, 'Invalid Instagram username')
      .optional()
      .nullable(),
    facebook: requiredString('Facebook profile url').regex(
      /^https?:\/\/(www\.)?facebook\.com\/[A-Za-z0-9._-]+\/?$/,
      'Invalid Facebook URL'
    ),
    language: enumString(['english', 'australian english'], 'Language'),
    travelRadius: requiredNumber('Travel radius').min(0, {
      error: 'Min. travel radius must be 0',
    }),
  }),
})

const updateArtistProfileSchema = z.object({
  body: z.object({
    name: optionalString('Name'),
    professionalBio: optionalString('Professional bio'),
    phone: requiredString('Phone').regex(
      /^(?:(?:\+61|0061)\s?4\d{2}\s?\d{3}\s?\d{3}|0[2-8]\s?\d{4}\s?\d{4})$/,
      'Invalid Australian phone number'
    ),
    businessAddress: optionalString('Business address'),
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
    city: optionalString('City'),
    state: optionalString('State'),
    postalCode: requiredString('Postal Code')
      .regex(/^[0-9]{4}$/, { error: 'Invalid Postal code' })
      .optional(),
    website: optionalString('Website').nullable(),
    instagram: requiredString('Instagram username')
      .regex(/^[a-zA-Z0-9._]{1,30}$/, 'Invalid Instagram username')
      .optional()
      .nullable(),
    facebook: requiredString('Facebook profile url')
      .regex(/^https?:\/\/(www\.)?facebook\.com\/[A-Za-z0-9._-]+\/?$/, 'Invalid Facebook URL')
      .optional(),
    language: enumString(['english', 'australian english'], 'Language').optional(),
    travelRadius: requiredNumber('Travel radius')
      .min(0, {
        error: 'Min. travel radius must be 0',
      })
      .optional(),
  }),
})

const getAllArtistProfileSchema = z.object({
  query: z.object({
    page: optionalNumber('Page'),
    limit: optionalNumber('Limit'),
    searchTerm: optionalString('Search term'),
    sortOrder: optionalEnumString(sortingOrderValues, 'Sort order'),
    sortBy: optionalEnumString(artistProfileSortableFields, 'Sort by'),
    fromDate: optionalDate('From date'),
    toDate: optionalDate('To date'),
  }),
})

export const artistProfileValidations = {
  createArtistProfileSchema,
  updateArtistProfileSchema,
  getAllArtistProfileSchema,
}

export type TCreateArtistProfilePayloadType = z.infer<typeof createArtistProfileSchema.shape.body>
export type TUpdateArtistProfilePayloadType = z.infer<typeof updateArtistProfileSchema.shape.body>
export type TGetAllArtistProfileQueryParamsType = z.infer<
  typeof getAllArtistProfileSchema.shape.query
>
