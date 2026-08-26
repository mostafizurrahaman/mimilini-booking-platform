export const artistProfileSearchableFields = [
  'name',
] as const

export const artistProfileSortableFields = [
  'createdAt',
  'updatedAt',
] as const

// Types (optional but recommended)
export type TArtistProfileSearchableField =
  (typeof artistProfileSearchableFields)[number]

export type TArtistProfileSortableField =
  (typeof artistProfileSortableFields)[number]