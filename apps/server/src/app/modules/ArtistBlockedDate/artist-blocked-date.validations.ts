import z from "zod"
import { requiredString, optionalNumber, optionalEnumString, optionalString, optionalDate, sortingOrderValues, sortOrder } from '@repo/shared'
import { artistBlockedDateSortableFields } from "@repo/db"



const createArtistBlockedDateSchema = z.object({
  body: z.object({})
})

const updateArtistBlockedDateSchema = z.object({
  params: z.object({
    id: requiredString("ID")
  }),
  body: z.object({})
})

const getAllArtistBlockedDateSchema = z.object({
  query: z.object({
    page: optionalNumber("Page"),
    limit: optionalNumber("Limit"),
    searchTerm: optionalString("Search term"),
    sortOrder: optionalEnumString(sortingOrderValues, "Sort order"),
    sortBy: optionalEnumString(artistBlockedDateSortableFields, "Sort by"),
    fromDate: optionalDate("From date"),
    toDate: optionalDate("To date")
  })
})

const getArtistBlockedDateByIdSchema = z.object({
  params: z.object({
    id: requiredString("ID")
  })
})

const deleteArtistBlockedDateByIdSchema = z.object({
  params: z.object({
    id: requiredString("ID")
  })
})

export const artistBlockedDateValidations = {
  createArtistBlockedDateSchema,
  updateArtistBlockedDateSchema,
  getAllArtistBlockedDateSchema,
  getArtistBlockedDateByIdSchema,
  deleteArtistBlockedDateByIdSchema
}

export type TCreateArtistBlockedDatePayloadType = z.infer<typeof createArtistBlockedDateSchema.shape.body>
export type TUpdateArtistBlockedDatePayloadType = z.infer<typeof updateArtistBlockedDateSchema.shape.body>
export type TGetAllArtistBlockedDateQueryParamsType = z.infer<typeof getAllArtistBlockedDateSchema.shape.query>
export type TGetArtistBlockedDateByIdParamsType = z.infer<typeof getArtistBlockedDateByIdSchema.shape.params>
export type TDeleteArtistBlockedDateByIdParamsType = z.infer<typeof deleteArtistBlockedDateByIdSchema.shape.params>