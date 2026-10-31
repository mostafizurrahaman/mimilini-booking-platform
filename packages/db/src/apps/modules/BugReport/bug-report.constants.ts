export const BUG_STATUS = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  RESOLVED: 'resolved',
  CLOSED: 'closed',
} as const

export type TBugStatus = (typeof BUG_STATUS)[keyof typeof BUG_STATUS]
export const BUG_STATUS_VALUES = Object.values(BUG_STATUS)

