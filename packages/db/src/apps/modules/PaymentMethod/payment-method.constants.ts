export const paymentMethodSearchableFields = ['name'] as const

export const paymentMethodSortableFields = ['createdAt', 'updatedAt'] as const

export const PaymentMethodType = {
  CARD: 'card',
  APPLE_PAY: 'apple_pay',
  GOOGLE_PAY: 'google_pay',
  PAYPAL: 'paypal',
} as const

export const paymentMethodValues = Object.values(PaymentMethodType)

// Types (optional but recommended)
export type TPaymentMethodSearchableField = (typeof paymentMethodSearchableFields)[number]

export type TPaymentMethodSortableField = (typeof paymentMethodSortableFields)[number]
export type TPaymentMethodType = (typeof PaymentMethodType)[keyof typeof PaymentMethodType]
