import z from 'zod'
import {
  requiredString,
  optionalNumber,
  optionalEnumString,
  optionalString,
  optionalDate,
  sortingOrderValues,
  requiredMongooseId,
  positiveNumber,
  requiredStrBoolean,
} from '@repo/shared'
import { artistServicesSortableFields } from '@repo/db'

const createArtistServicesSchema = z.object({
  body: z.object({
    category: requiredMongooseId('Category ID'),
    name: requiredString('Name'),
    description: optionalString('Description'),
    durationMinutes: positiveNumber('Duration Minutes'),
    price: positiveNumber('Price').min(0, {
      error: 'Min. price must be 0.',
    }),
    isActive: requiredStrBoolean('Is Active'),
  }),
})

const updateArtistServicesSchema = z.object({
  params: z.object({
    id: requiredMongooseId('Service ID'),
  }),
  body: z.object({
    category: requiredMongooseId('Category ID').optional(),
    name: optionalString('Name'),
    description: optionalString('Description'),
    durationMinutes: positiveNumber('Duration Minutes').optional(),
    price: positiveNumber('Price')
      .min(0, {
        error: 'Min. price must be 0.',
      })
      .optional(),
    isActive: requiredStrBoolean('Is Active').optional(),
  }),
})
const toggleArtistServicesFeaturedSchema = z.object({
  params: z.object({
    id: requiredMongooseId('Service ID'),
  }),
})
const toggleArtistServicesPopularSchema = z.object({
  params: z.object({
    id: requiredMongooseId('Service ID'),
  }),
})

const getAllArtistServicesSchema = z.object({
  query: z.object({
    page: optionalNumber('Page'),
    limit: optionalNumber('Limit'),
    searchTerm: optionalString('Search term'),
    isFeatured: requiredStrBoolean('Is Featured').optional(),
    category: requiredMongooseId('Category').optional(),
    artist: requiredMongooseId('Artist').optional(),
    isActive: requiredStrBoolean('is Active').optional(),
    isPopular: requiredStrBoolean('is Popular').optional(),
    sortOrder: optionalEnumString(sortingOrderValues, 'Sort order'),
    sortBy: optionalEnumString(artistServicesSortableFields, 'Sort by'),
    fromDate: optionalDate('From date'),
    toDate: optionalDate('To date'),
  }),
})

const getArtistServicesByIdSchema = z.object({
  params: z.object({
    id: requiredString('ID'),
  }),
})

const deleteArtistServicesByIdSchema = z.object({
  params: z.object({
    id: requiredString('ID'),
  }),
})

export const artistServicesValidations = {
  createArtistServicesSchema,
  updateArtistServicesSchema,
  getAllArtistServicesSchema,
  getArtistServicesByIdSchema,
  deleteArtistServicesByIdSchema,
  toggleArtistServicesFeaturedSchema,
  toggleArtistServicesPopularSchema,
}

export type TCreateArtistServicesPayloadType = z.infer<typeof createArtistServicesSchema.shape.body>
export type TUpdateArtistServicesPayloadType = z.infer<typeof updateArtistServicesSchema.shape.body>
export type TGetAllArtistServicesQueryParamsType = z.infer<
  typeof getAllArtistServicesSchema.shape.query
>
export type TGetArtistServicesByIdParamsType = z.infer<
  typeof getArtistServicesByIdSchema.shape.params
>
export type TDeleteArtistServicesByIdParamsType = z.infer<
  typeof deleteArtistServicesByIdSchema.shape.params
>
