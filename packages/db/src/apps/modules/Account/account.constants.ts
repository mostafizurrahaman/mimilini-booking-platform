export const accountSearchableFields = ['name'] as const

export const accountSortableFields = ['createdAt', 'updatedAt'] as const

export const Countries = {
  AUSTRALIA: 'AU',
} as const

export const CountryValues = Object.values(Countries)

export type TCountry = (typeof Countries)[keyof typeof Countries]

// Types (optional but recommended)
export type TAccountSearchableField = (typeof accountSearchableFields)[number]

export type TAccountSortableField = (typeof accountSortableFields)[number]

export const Currency = {
  AUD: 'aud',
} as const

export const CurrencyValues = Object.values(Currency)

export type TCurrency = (typeof Currency)[keyof typeof Currency]

export const DefaultCurrency: TCurrency = Currency.AUD

export const accountStatus = {
  PENDING: 'pending',
  ACTIVE: 'active',
  RESTRICTED: 'restricted',
} as const
export const accountStatusValues = Object.values(accountStatus)

export type TAccountStatus = (typeof accountStatus)[keyof typeof accountStatus]
