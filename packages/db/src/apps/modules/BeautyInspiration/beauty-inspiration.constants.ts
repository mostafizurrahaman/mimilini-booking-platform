export const beautyInspirationSearchableFields = ['tags'] as const

export const beautyInspirationSortableFields = ['createdAt', 'updatedAt'] as const

// Types (optional but recommended)
export type TBeautyInspirationSearchableField = (typeof beautyInspirationSearchableFields)[number]

export type TBeautyInspirationSortableField = (typeof beautyInspirationSortableFields)[number]
