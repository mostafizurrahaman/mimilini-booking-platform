export const WALLET_TRANSACTION_TYPE = {
  CREDIT: 'CREDIT',
  DEBIT: 'DEBIT',
} as const

export type TWalletTransactionType =
  (typeof WALLET_TRANSACTION_TYPE)[keyof typeof WALLET_TRANSACTION_TYPE]
export const WALLET_TRANSACTION_TYPE_VALUES = Object.values(
  WALLET_TRANSACTION_TYPE
)

export const WALLET_SOURCE = {
  CANCELLATION_CREDIT: 'CANCELLATION_CREDIT', // Issued when booking cancelled >24h (3-year expiry)
  BOOKING_PAYMENT: 'BOOKING_PAYMENT', // Spent as platform credit on a booking
  BOOKING_ROLLBACK: 'BOOKING_ROLLBACK', // Reverted if booking failed during creation
  INITIAL_DEPOSIT_EARNING: 'INITIAL_DEPOSIT_EARNING',
  BALANCE_PAYMENT_EARNING: 'BALANCE_PAYMENT_EARNING',
  STRIPE_PAYOUT: 'STRIPE_PAYOUT',
  ADMIN_ADJUSTMENT: 'ADMIN_ADJUSTMENT',
  ARTIST_COMPENSATION: 'ARTIST_COMPENSATION', // $15 credit if artist cancelled
  EXPIRED_CREDIT: 'EXPIRED_CREDIT', // After 36 months
} as const

export type TWalletSource = (typeof WALLET_SOURCE)[keyof typeof WALLET_SOURCE]
export const WALLET_SOURCE_VALUES = Object.values(WALLET_SOURCE)
