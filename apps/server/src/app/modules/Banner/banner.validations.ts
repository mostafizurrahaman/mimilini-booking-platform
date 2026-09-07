import z from 'zod'
import {
  requiredString,
  optionalNumber,
  optionalEnumString,
  optionalString,
  optionalDate,
  sortingOrderValues,
  requiredDate,
  enumString,
  skipPagination,
} from '@repo/shared'
import {
  BannerPriority,
  bannerPriorityValues,
  bannerSortableFields,
  bannerStatusValues,
} from '@repo/db'
import moment from 'moment'

const createBannerSchema = z.object({
  body: z
    .object({
      title: requiredString('Title'),
      subtitle: requiredString('subtitle'),
      ctaBtnText: requiredString('ctaBtnText'),
      ctaDestination: requiredString('ctaDestination'),
      startDate: requiredDate('Start date'),
      endDate: requiredDate('End date'),
      priority: optionalEnumString(
        bannerPriorityValues?.map((item) => String(item)),
        'Priority'
      )
        .default(BannerPriority.MEDIUM?.toString())
        .transform((val) => Number(val)),
      status: enumString(bannerStatusValues, 'Status'),
    })
    .superRefine((data, ctx) => {
      // start date and end Date:
      const todayStart = moment().startOf('day')
      const startDate = moment(data.startDate)
      const endDate = moment(data.endDate)

      // 1. Check if startDate is before today
      if (startDate.isBefore(todayStart)) {
        ctx.addIssue({
          code: 'custom',
          path: ['startDate'],
          message: 'Start date must be present or future date.',
        })
      }

      // 2. Check if endDate is before today
      if (endDate.isBefore(todayStart)) {
        ctx.addIssue({
          code: 'custom',
          path: ['endDate'],
          message: 'End date must be present or future date.',
        })
      }

      // 3. Check if endDate is before startDate
      if (endDate.isBefore(startDate)) {
        ctx.addIssue({
          code: 'custom',
          path: ['endDate'],
          message: 'End date must be after start date.',
        })
      }
    }),
})

const updateBannerSchema = z.object({
  params: z.object({
    bannerId: requiredString('BannerId'),
  }),
  body: z
    .object({
      title: optionalString('Title'),
      subtitle: optionalString('subtitle'),
      ctaBtnText: optionalString('ctaBtnText'),
      ctaDestination: optionalString('ctaDestination'),
      startDate: optionalDate('Start date'),
      endDate: optionalDate('End date'),
      priority: optionalEnumString(
        bannerPriorityValues?.map((item) => String(item)),
        'Priority'
      )
        .default(BannerPriority.MEDIUM?.toString())
        .transform((val) => Number(val)),
      status: optionalEnumString(bannerStatusValues, 'Status'),
    })
    .superRefine((data, ctx) => {
      // ?? Get current date:
      const todayStart = moment().startOf('day')

      const startDate = data?.startDate ? moment(data?.startDate) : null
      const endDate = data?.endDate ? moment(data?.endDate) : null

      if (endDate && endDate.isBefore(todayStart)) {
        ctx.addIssue({
          code: 'custom',
          path: ['endDate'],
          message: 'End date must be present or future date.',
        })
      }

      if (startDate && endDate && endDate.isBefore(startDate)) {
        ctx.addIssue({
          code: 'custom',
          path: ['endDate'],
          message: 'End date must be after start.',
        })
      }
    }),
})

const updateBannerStatusSchema = z.object({
  params: z.object({
    bannerId: requiredString('BannerId'),
  }),
  body: z.object({
    status: optionalEnumString(bannerStatusValues, 'Status'),
  }),
})

const getAllBannerSchema = z.object({
  query: z.object({
    page: optionalNumber('Page'),
    limit: optionalNumber('Limit'),
    searchTerm: optionalString('Search term'),
    sortOrder: optionalEnumString(sortingOrderValues, 'Sort order'),
    sortBy: optionalEnumString(bannerSortableFields, 'Sort by'),
    fromDate: optionalDate('From date'),
    toDate: optionalDate('To date'),
  }),
})

const getAllActiveBannerSchema = z.object({
  query: z.object({
    page: optionalNumber('Page'),
    limit: optionalNumber('Limit'),
    searchTerm: optionalString('Search term'),
    sortOrder: optionalEnumString(sortingOrderValues, 'Sort order'),
    sortBy: optionalEnumString(bannerSortableFields, 'Sort by'),
    skipPagination: skipPagination(),
  }),
})

const getBannerByIdSchema = z.object({
  params: z.object({
    id: requiredString('ID'),
  }),
})

const deleteBannerByIdSchema = z.object({
  params: z.object({
    id: requiredString('ID'),
  }),
})

export const bannerValidations = {
  createBannerSchema,
  updateBannerSchema,
  getAllBannerSchema,
  getBannerByIdSchema,
  deleteBannerByIdSchema,
  getAllActiveBannerSchema,
  updateBannerStatusSchema,
}

export type TCreateBannerPayloadType = z.infer<typeof createBannerSchema.shape.body>
export type TUpdateBannerPayloadType = z.infer<typeof updateBannerSchema.shape.body>
export type TGetAllBannerQueryParamsType = z.infer<typeof getAllBannerSchema.shape.query>
export type TGetAllActiveBannerQueryParamsType = z.infer<
  typeof getAllActiveBannerSchema.shape.query
>
export type TGetBannerByIdParamsType = z.infer<typeof getBannerByIdSchema.shape.params>
export type TDeleteBannerByIdParamsType = z.infer<typeof deleteBannerByIdSchema.shape.params>
export type TUpdateStatusPayloadType = z.infer<typeof updateBannerStatusSchema.shape.body>
