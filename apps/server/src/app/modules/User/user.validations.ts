import {
  AuthRolesValues,
  AuthStatusValues,
  userSortableFields,
  VerificationStatusValues,
} from 'packages/db/src'
import {
  optionalDate,
  optionalEnumString,
  optionalNumber,
  optionalString,
  requiredMongooseId,
  sortingOrderValues,
} from 'packages/shared/src'
import z from 'zod'

const getAllUserSchema = z.object({
  query: z.object({
    page: optionalNumber('Page'),
    limit: optionalNumber('Limit'),
    searchTerm: optionalString('Search term'),
    sortOrder: optionalEnumString(sortingOrderValues, 'Sort order'),
    sortBy: optionalEnumString(userSortableFields, 'Sort by'),
    status: optionalEnumString(AuthStatusValues, 'Status'),
    verificationStatus: optionalEnumString(VerificationStatusValues, 'Verification status'),
    role: optionalEnumString(AuthRolesValues, 'Role'),
    fromDate: optionalDate('From date'),
    toDate: optionalDate('To date'),
  }),
})

const getAllVerificationsDocs = z.object({
  query: getAllUserSchema.shape.query.omit({
    role: true,
  }),
})

// Year regex:
const yearRegex = /^(19|20|21)\d{2}$/
const getUserOverview = z.object({
  query: z.object({
    year: z
      .string({ error: 'Year is required' })
      .regex(yearRegex, { error: 'Year must be a 4-digit number' })
      .optional(),
  }),
})

export const getUserDetailsByID = z.object({
  params: z.object({
    id: requiredMongooseId('User ID'),
  }),
})

export const UserValidations = {
  getAllUserSchema,
  getUserOverview,
  getAllVerificationsDocs,
  getUserDetailsByID,
}

// ?? Types
export type TGetAllUserQueryType = z.infer<typeof getAllUserSchema.shape.query>
export type TGetUserOverviewQueryType = z.infer<typeof getUserOverview.shape.query>
export type TGetVerificationsDocsQueryType = z.infer<typeof getAllVerificationsDocs.shape.query>
