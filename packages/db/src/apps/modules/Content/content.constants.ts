export const contentSearchableFields = ['name'] as const

export const contentSortableFields = ['createdAt', 'updatedAt'] as const

// Const:
export const ContentType = {
  TERMS_AND_CONDITION: 'terms_and_condition',
  PRIVACY_POLICY: 'privacy_policy',
  CANCELLATION_POLICY: 'cancellation_policy',
  REFUND_POLICY: 'refund_policy',
  INCIDENT_REPORT: 'incident_report',
  SAFETY_POLICY: 'safety_policy',
  ABOUT_US: 'about_us',
} as const

// Values :
export const contentTypeValues = Object.values(ContentType)

// Types (optional but recommended)
export type TContentSearchableField = (typeof contentSearchableFields)[number]
export type TContentSortableField = (typeof contentSortableFields)[number]
export type TContentType = (typeof ContentType)[keyof typeof ContentType]
