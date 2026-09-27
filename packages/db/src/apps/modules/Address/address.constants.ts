export const addressSearchableFields = [
  'name',
  'address',
  'postalCode',
  'city',
  'state',
  'country',
  'apartmentOrUnits',
] as const

export const addressSortableFields = [
  'createdAt',
  'updatedAt',
  'city',
  'state',
  'country',
  'apartmentOrUnit',
] as const

export const AddressType = {
  HOME: 'home',
  WORK: 'work',
  OTHER: 'other',
} as const

export const AddressTypeValues = Object.values(AddressType)
export type TAddressType = (typeof AddressType)[keyof typeof AddressType]
// Types (optional but recommended)
export type TAddressSearchableField = (typeof addressSearchableFields)[number]

export type TAddressSortableField = (typeof addressSortableFields)[number]
