export const REVIEW_SEARCHABLE_FIELDS = ['comment', 'reviewNumber', 'serviceName', 'location']
export const MIN_RATING = 1
export const MAX_RATING = 5

export const REVIEW_TAG_OPTIONS = [
  'Friendly',
  'Professional',
  'Punctual',
  'Hygienic',
  'Great Comm.',
  'Skilled',
  'Attentive',
  'Good Vibes',
  'Well Equipped',
] as const

export const REVIEW_MODERATION_STATUS = {
  APPROVED: 'approved',
  PENDING: 'pending',
  REPORTED: 'reported',
  RESOLVED: 'resolved',
  HIDDEN: 'hidden',
  REMOVED: 'removed',
} as const

export const REVIEW_MODERATION_STATUS_VALUES = Object.values(REVIEW_MODERATION_STATUS)

export const ADMIN_REVIEW_ACTION = {
  APPROVE: 'approve',
  HIDE: 'hide',
  REMOVE: 'remove',
  WARN_USER: 'warn_user',
  SUSPEND_REVIEWER: 'suspend_reviewer',
  FEATURE_STORY: 'feature_story',
  UNFEATURE_STORY: 'unfeature_story',
} as const

export const ADMIN_REVIEW_ACTION_VALUES = Object.values(ADMIN_REVIEW_ACTION)

export type TReviewModerationStatus =
  (typeof REVIEW_MODERATION_STATUS)[keyof typeof REVIEW_MODERATION_STATUS]
export type TAdminReviewAction = (typeof ADMIN_REVIEW_ACTION)[keyof typeof ADMIN_REVIEW_ACTION]
