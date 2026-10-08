export const platformSettingsSortableFields = [
  'createdAt',
  'updatedAt',
] as const

export type TPlatformSettingsSortableField =
  (typeof platformSettingsSortableFields)[number]