export const WALLET_USER_ROLE = {
  CUSTOMER: 'customer',
  ARTIST: 'artist',
} as const

export type TWalletUserRole =
  (typeof WALLET_USER_ROLE)[keyof typeof WALLET_USER_ROLE]
export const WALLET_USER_ROLE_VALUES = Object.values(WALLET_USER_ROLE)
