import z from "zod"
import { requiredString, optionalNumber, optionalEnumString, optionalString, optionalDate, sortingOrderValues, sortOrder } from '@repo/shared'
import { availabilitySortableFields } from "@repo/db"



const createAvailabilitySchema = z.object({
  body: z.object({})
})

const updateAvailabilitySchema = z.object({
  params: z.object({
    id: requiredString("ID")
  }),
  body: z.object({})
})

const getAllAvailabilitySchema = z.object({
  query: z.object({
    page: optionalNumber("Page"),
    limit: optionalNumber("Limit"),
    searchTerm: optionalString("Search term"),
    sortOrder: optionalEnumString(sortingOrderValues, "Sort order"),
    sortBy: optionalEnumString(availabilitySortableFields, "Sort by"),
    fromDate: optionalDate("From date"),
    toDate: optionalDate("To date")
  })
})

const getAvailabilityByIdSchema = z.object({
  params: z.object({
    id: requiredString("ID")
  })
})

const deleteAvailabilityByIdSchema = z.object({
  params: z.object({
    id: requiredString("ID")
  })
})

export const availabilityValidations = {
  createAvailabilitySchema,
  updateAvailabilitySchema,
  getAllAvailabilitySchema,
  getAvailabilityByIdSchema,
  deleteAvailabilityByIdSchema
}

export type TCreateAvailabilityPayloadType = z.infer<typeof createAvailabilitySchema.shape.body>
export type TUpdateAvailabilityPayloadType = z.infer<typeof updateAvailabilitySchema.shape.body>
export type TGetAllAvailabilityQueryParamsType = z.infer<typeof getAllAvailabilitySchema.shape.query>
export type TGetAvailabilityByIdParamsType = z.infer<typeof getAvailabilityByIdSchema.shape.params>
export type TDeleteAvailabilityByIdParamsType = z.infer<typeof deleteAvailabilityByIdSchema.shape.params>