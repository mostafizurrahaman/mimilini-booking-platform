export const artistServicesSearchableFields = [
  'name',
  'description',
  'artistName',
  'categoryName',
  'artistPhone',
  'artistEmail',
] as const

export const artistServicesSortableFields = [
  'createdAt',
  'updatedAt',
  'name',
  'artistName',
  'durationMinutes',
  'categoryName',
  'price',
] as const

// Types (optional but recommended)
export type TArtistServicesSearchableField = (typeof artistServicesSearchableFields)[number]

export type TArtistServicesSortableField = (typeof artistServicesSortableFields)[number]
