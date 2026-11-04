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
  requiredStrBoolean,
  requiredMongooseId,
} from '@repo/shared'
import { artistProfileSortableFields } from '@repo/db'

const createArtistProfileBodySchema = z
  .object({
    businessName: requiredString('Business name'),
    phone: requiredString('Phone').regex(
      /^(?:61|0)[234578]\d{8}$/,
      'Invalid Australian phone number'
    ),
    abn: requiredString('ABN (Australian business number) is required.').regex(
      /^\d{2}\s\d{3}\s\d{3}\s\d{3}$/,
      {
        error: 'Invalid ABN.',
      }
    ),
    isGstRegistered: requiredStrBoolean("GST registered").optional().default(false),
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
    facebook: requiredString('Facebook profile url')
      .regex(/^https?:\/\/(www\.)?facebook\.com\/[A-Za-z0-9._-]+\/?$/, 'Invalid Facebook URL')
      .optional()
      .nullable(),
    language: enumString(['english', 'australian english'], 'Language'),
    travelRadius: requiredNumber('Travel radius').min(0, {
      error: 'Min. travel radius must be 0',
    }),
  })
  .refine(
    (data) => {
      const hasWebsite = Boolean(data.website && data.website.trim())
      const hasInstagram = Boolean(data.instagram && data.instagram.trim())
      const hasFacebook = Boolean(data.facebook && data.facebook.trim())
      return hasWebsite || hasInstagram || hasFacebook
    },
    {
      message: 'At least one of website, Instagram, or Facebook is mandatory.',
      path: ['website'],
    }
  )

const createArtistProfileSchema = z.object({
  body: createArtistProfileBodySchema,
})

const updateArtistProfileBodySchema = z
  .object({
    name: optionalString('Name'),
    professionalBio: optionalString('Professional bio'),
    phone: requiredString('Phone')
      .regex(
        /^(?:(?:\+61|0061)\s?4\d{2}\s?\d{3}\s?\d{3}|0[2-8]\s?\d{4}\s?\d{4})$/,
        'Invalid Australian phone number'
      )
      .optional(),
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
      .optional()
      .nullable(),
    language: enumString(['english', 'australian english'], 'Language').optional(),
    travelRadius: requiredNumber('Travel radius')
      .min(0, {
        error: 'Min. travel radius must be 0',
      })
      .optional(),
  })
  .refine(
    (data) => {
      const hasWebsiteKey = data.website !== undefined
      const hasInstagramKey = data.instagram !== undefined
      const hasFacebookKey = data.facebook !== undefined

      if (hasWebsiteKey && hasInstagramKey && hasFacebookKey) {
        const hasWebsite = Boolean(data.website && data.website.trim())
        const hasInstagram = Boolean(data.instagram && data.instagram.trim())
        const hasFacebook = Boolean(data.facebook && data.facebook.trim())
        return hasWebsite || hasInstagram || hasFacebook
      }
      return true
    },
    {
      message: 'At least one of website, Instagram, or Facebook is mandatory.',
      path: ['website'],
    }
  )

const updateArtistProfileSchema = z.object({
  body: updateArtistProfileBodySchema,
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
    includeInActive: requiredStrBoolean("Include in Active").optional().default(false),
  }),
})

const verifyArtistDocumentSchema = z.object({
  params: z.object({
    userId: requiredString('User ID'),
  }),
})

const rejectArtistDocumentSchema = z.object({
  params: z.object({
    userId: requiredString('User ID'),
  }),
  body: z.object({
    reason: z.string({
      error: 'Rejection reason is required.',
    }),
  }),
})

const findAvailableArtistsSchema = z.object({
  query: z.object({
    artistId: optionalString('Artist ID'),
    searchTerm: optionalString('Search Term'),
    sortBy: optionalString('Sort By'),
    sortOrder: optionalString('Sort Order'),
    categoryId: optionalString('Category ID'),
    latitude: z.string().optional(),
    longitude: z.string().optional(),
    radius: z.string().optional(),
    date: z.string().optional(),
    time: z.string().optional(),
    guestCount: z.string().optional(),
    availableToday: z.string().optional(),
    page: z.string().optional(),
    limit: z.string().optional(),
  }),
})

const addCertificationSchema = z.object({
  body: z.object({
    name: z.string().trim().optional(),
    issuedAt: z.string().trim().optional(),
    url: z.string().trim().optional(),
  }),
})

const removeCertificationSchema = z.object({
  body: z
    .object({
      url: optionalString('Certificate URL'),
      certificationId: optionalString('Certificate ID'),
    })
    .optional(),
  query: z
    .object({
      url: optionalString('Certificate URL'),
      certificationId: optionalString('Certificate ID'),
    })
    .optional(),
})

const removePortfolioSchema = z.object({
  body: z
    .object({
      url: optionalString('Portfolio image URL'),
    })
    .optional(),
  query: z
    .object({
      url: optionalString('Portfolio image URL'),
    })
    .optional(),
})

const getArtistDetailsSchema = z.object({
  params: z.object({
    artistId: requiredString('Artist ID'),
  }),
  query: z.object({
    date: optionalDate('Date'),
    serviceId: requiredMongooseId('Service ID').optional(),
    latitude: z.string().optional(),
    longitude: z.string().optional(),
  }),
})

const toggleFavoriteArtistSchema = z.object({
  params: z.object({
    artistId: requiredMongooseId('Artist ID'),
  }),
})

export const artistProfileValidations = {
  createArtistProfileSchema,
  updateArtistProfileSchema,
  getAllArtistProfileSchema,
  findAvailableArtistsSchema,
  getArtistDetailsSchema,
  addCertificationSchema,
  removeCertificationSchema,
  removePortfolioSchema,

  // ?? Verification Status:
  verifyArtistDocumentSchema,
  rejectArtistDocumentSchema,

  // Favorites:
  toggleFavoriteArtistSchema,
}

export type TCreateArtistProfilePayloadType = z.infer<typeof createArtistProfileBodySchema>
export type TUpdateArtistProfilePayloadType = z.infer<typeof updateArtistProfileBodySchema>
export type TGetAllArtistProfileQueryParamsType = z.infer<
  typeof getAllArtistProfileSchema.shape.query
>

export type TVerificationDocumentParams = z.infer<typeof verifyArtistDocumentSchema.shape.params>
export type TRejectArtistDocumentPayload = z.infer<typeof rejectArtistDocumentSchema.shape.body>
