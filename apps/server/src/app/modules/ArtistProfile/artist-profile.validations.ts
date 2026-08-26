import z from "zod"
import { requiredString, optionalNumber, optionalEnumString, optionalString, optionalDate, sortingOrderValues, sortOrder } from '@repo/shared'
import { artistProfileSortableFields } from "@repo/db"



const createArtistProfileSchema = z.object({
  body: z.object({})
})

const updateArtistProfileSchema = z.object({
  params: z.object({
    id: requiredString("ID")
  }),
  body: z.object({})
})

const getAllArtistProfileSchema = z.object({
  query: z.object({
    page: optionalNumber("Page"),
    limit: optionalNumber("Limit"),
    searchTerm: optionalString("Search term"),
    sortOrder: optionalEnumString(sortingOrderValues, "Sort order"),
    sortBy: optionalEnumString(artistProfileSortableFields, "Sort by"),
    fromDate: optionalDate("From date"),
    toDate: optionalDate("To date")
  })
})

const getArtistProfileByIdSchema = z.object({
  params: z.object({
    id: requiredString("ID")
  })
})

const deleteArtistProfileByIdSchema = z.object({
  params: z.object({
    id: requiredString("ID")
  })
})

export const artistProfileValidations = {
  createArtistProfileSchema,
  updateArtistProfileSchema,
  getAllArtistProfileSchema,
  getArtistProfileByIdSchema,
  deleteArtistProfileByIdSchema
}

export type TCreateArtistProfilePayloadType = z.infer<typeof createArtistProfileSchema.shape.body>
export type TUpdateArtistProfilePayloadType = z.infer<typeof updateArtistProfileSchema.shape.body>
export type TGetAllArtistProfileQueryParamsType = z.infer<typeof getAllArtistProfileSchema.shape.query>
export type TGetArtistProfileByIdParamsType = z.infer<typeof getArtistProfileByIdSchema.shape.params>
export type TDeleteArtistProfileByIdParamsType = z.infer<typeof deleteArtistProfileByIdSchema.shape.params>