export const categorySearchableFields = ['name', 'description', 'slug'] as const

export const categorySortableFields = ['createdAt', 'updatedAt', 'name', 'description']

// Types (optional but recommended)
export type TCategorySearchableField = (typeof categorySearchableFields)[number]

export type TCategorySortableField = (typeof categorySortableFields)[number]
