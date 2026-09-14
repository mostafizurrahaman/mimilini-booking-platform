import z from 'zod'
import {
  requiredString,
  optionalNumber,
  optionalEnumString,
  optionalString,
  sortingOrderValues,
  dateOnlyString,
  optionalDateOnlyString,
  enumString,
  requiredMongooseId,
  skipPagination,
} from '@repo/shared'
import {
  artistBlockedDateSortableFields,
  blockedDateTypeValues,
  BLOCKED_DATE_TYPES,
} from '@repo/db'

const blockedDatesSchema = z
  .array(dateOnlyString('Date'))
  .min(1, { error: 'At least one date is required' })
  .max(366, { error: 'You cannot block more than 366 dates at once' })

const createArtistBlockedDateSchema = z.object({
  body: z
    .object({
      date: dateOnlyString('Date').optional(),
      dates: blockedDatesSchema.optional(),
      reason: enumString(blockedDateTypeValues, 'Reason'),
      note: optionalString('Note'),
    })
    .superRefine((data, ctx) => {
      if (!data.date && (!data.dates || data.dates.length === 0)) {
        ctx.addIssue({
          code: 'custom',
          path: ['dates'],
          message: 'At least one date is required',
        })
      }

      if (data.reason === BLOCKED_DATE_TYPES.OTHER && !data.note) {
        ctx.addIssue({
          code: 'custom',
          path: ['note'],
          message: 'Note is required when reason is other',
        })
      }
    }),
})

const updateArtistBlockedDateSchema = z.object({
  params: z.object({
    id: requiredString('ID'),
  }),
  body: z
    .object({
      date: optionalDateOnlyString('Date'),
      reason: optionalEnumString(blockedDateTypeValues, 'Reason'),
      note: optionalString('Note'),
    })
    .superRefine((data, ctx) => {
      if (data.reason === BLOCKED_DATE_TYPES.OTHER && !data.note) {
        ctx.addIssue({
          code: 'custom',
          path: ['note'],
          message: 'Note is required when reason is other',
        })
      }
    }),
})

const getAllArtistBlockedDateSchema = z.object({
  query: z.object({
    page: optionalNumber('Page'),
    limit: optionalNumber('Limit'),
    searchTerm: optionalString('Search term'),
    sortOrder: optionalEnumString(sortingOrderValues, 'Sort order'),
    sortBy: optionalEnumString(artistBlockedDateSortableFields, 'Sort by'),
    fromDate: optionalDateOnlyString('From date'),
    toDate: optionalDateOnlyString('To date'),
    user: requiredMongooseId('User').optional(),
    reason: optionalEnumString(blockedDateTypeValues, 'Reason'),
    skipPagination: skipPagination().optional(),
  }),
})

const getArtistBlockedDateByIdSchema = z.object({
  params: z.object({
    id: requiredString('ID'),
  }),
})

const deleteArtistBlockedDateByIdSchema = z.object({
  params: z.object({
    id: requiredString('ID'),
  }),
})

export const artistBlockedDateValidations = {
  createArtistBlockedDateSchema,
  updateArtistBlockedDateSchema,
  getAllArtistBlockedDateSchema,
  getArtistBlockedDateByIdSchema,
  deleteArtistBlockedDateByIdSchema,
}

export type TCreateArtistBlockedDatePayloadType = z.infer<
  typeof createArtistBlockedDateSchema.shape.body
>
export type TUpdateArtistBlockedDatePayloadType = z.infer<
  typeof updateArtistBlockedDateSchema.shape.body
>
export type TGetAllArtistBlockedDateQueryParamsType = z.infer<
  typeof getAllArtistBlockedDateSchema.shape.query
>
export type TGetArtistBlockedDateByIdParamsType = z.infer<
  typeof getArtistBlockedDateByIdSchema.shape.params
>
export type TDeleteArtistBlockedDateByIdParamsType = z.infer<
  typeof deleteArtistBlockedDateByIdSchema.shape.params
>
