export const PAYMENT_TRANSACTION_TYPE = {
  INITIAL_20: 'INITIAL_20',
  BALANCE_80: 'BALANCE_80',
  FULL_100: 'FULL_100',
  CANCELLATION_FEE: 'CANCELLATION_FEE',
  REFUND: 'REFUND',
  STRIPE_TRANSFER: 'STRIPE_TRANSFER',
  PENALTY: 'PENALTY',
} as const

export type TPaymentTransactionType =
  (typeof PAYMENT_TRANSACTION_TYPE)[keyof typeof PAYMENT_TRANSACTION_TYPE]
export const PAYMENT_TRANSACTION_TYPE_VALUES = Object.values(
  PAYMENT_TRANSACTION_TYPE
)

export const PAYMENT_STATUS = {
  PENDING: 'PENDING',
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
  REFUNDED: 'REFUNDED',
} as const

export type TPaymentStatus =
  (typeof PAYMENT_STATUS)[keyof typeof PAYMENT_STATUS]
export const PAYMENT_STATUS_VALUES = Object.values(PAYMENT_STATUS)

export const PAYMENT_GATEWAY = {
  STRIPE_CONNECT: 'stripe_connect',
  PLATFORM_CREDIT: 'platform_credit',
  MIXED: 'mixed',
} as const

export type TPaymentGateway =
  (typeof PAYMENT_GATEWAY)[keyof typeof PAYMENT_GATEWAY]
export const PAYMENT_GATEWAY_VALUES = Object.values(PAYMENT_GATEWAY)
