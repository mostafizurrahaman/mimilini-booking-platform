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

export const UserValidations = {
  getAllUserSchema,
}

// ?? Types
export type TGetAllUserQueryType = z.infer<typeof getAllUserSchema.shape.query>
