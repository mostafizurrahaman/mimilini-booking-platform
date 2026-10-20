export const PENALTY_STATUS = {
  PENDING: 'PENDING',
  DEDUCTED: 'DEDUCTED',
  PAID: 'PAID',
  WAIVED: 'WAIVED',
} as const

export type TPenaltyStatus = (typeof PENALTY_STATUS)[keyof typeof PENALTY_STATUS]
export const PENALTY_STATUS_VALUES = Object.values(PENALTY_STATUS)

export const PENALTY_BUDGET_TIER = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
} as const

export type TPenaltyBudgetTier =
  (typeof PENALTY_BUDGET_TIER)[keyof typeof PENALTY_BUDGET_TIER]
export const PENALTY_BUDGET_TIER_VALUES = Object.values(PENALTY_BUDGET_TIER)

export const PENALTY_TIMEFRAME_TIER = {
  MORE_THAN_14_DAYS: 'moreThan14Days',
  SEVEN_TO_13_DAYS: 'sevenTo13Days',
  WITHIN_48_HOURS: 'within48Hours',
} as const

export type TPenaltyTimeframeTier =
  (typeof PENALTY_TIMEFRAME_TIER)[keyof typeof PENALTY_TIMEFRAME_TIER]
export const PENALTY_TIMEFRAME_TIER_VALUES = Object.values(PENALTY_TIMEFRAME_TIER)
