import { Document, Types } from 'mongoose'
import type {
  TPaymentGateway,
  TPaymentStatus,
  TPaymentTransactionType,
} from './payment-transaction.constants'

export interface IPaymentMethodDetails {
  brand?: string | null | undefined
  last4?: string | null | undefined
  expMonth?: number | null | undefined
  expYear?: number | null | undefined
}

export interface IPaymentTransaction {
  transactionId: string
  booking: Types.ObjectId
  bookingGroupId?: string | null | undefined
  user: Types.ObjectId // Client / Payer
  artist: Types.ObjectId // Professional / Payee
  stripeConnectedAccountId?: string | null | undefined

  type: TPaymentTransactionType
  gateway: TPaymentGateway
  status: TPaymentStatus
  currency: string // Default: 'AUD'

  // Amounts in AUD:
  amount: number // Gross charged in this txn
  platformCreditUsed?: number | null | undefined
  marketplaceFee: number // Platform commission
  marketplaceFeeGst: number // GST on platform commission
  stripeFeeBorne: number // Stripe processing fee
  artistNetShare: number // Net to artist

  // Stripe References:
  stripePaymentIntentId?: string | null | undefined
  stripeChargeId?: string | null | undefined
  stripeTransferId?: string | null | undefined
  stripeRefundId?: string | null | undefined

  paymentMethodDetails?: IPaymentMethodDetails | null | undefined
  receiptUrl?: string | null | undefined
  failureReason?: string | null | undefined
  createdAt?: Date | undefined
  updatedAt?: Date | undefined
}

export interface IPaymentTransactionDoc extends Document, IPaymentTransaction {}
