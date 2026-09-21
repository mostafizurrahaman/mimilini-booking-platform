export const beautyPreferencesSearchableFields = ['name'] as const

export const beautyPreferencesSortableFields = ['createdAt', 'updatedAt'] as const

// Types (optional but recommended)
export type TBeautyPreferencesSearchableField = (typeof beautyPreferencesSearchableFields)[number]

export type TBeautyPreferencesSortableField = (typeof beautyPreferencesSortableFields)[number]
