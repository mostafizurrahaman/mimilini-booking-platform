
export const Languages = { 
  ENGLISH: "english", 
  AUSTRALIAN_ENGLISH: "australian english"
} as const

export const languageValues = Object.values(Languages)

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

export type TLanguageType = (typeof Languages)[keyof typeof Languages]