import { Schema, model } from 'mongoose'
import type { IPaymentTransactionDoc } from './payment-transaction.interfaces'
import {
  PAYMENT_GATEWAY,
  PAYMENT_GATEWAY_VALUES,
  PAYMENT_STATUS,
  PAYMENT_STATUS_VALUES,
  PAYMENT_TRANSACTION_TYPE_VALUES,
} from './payment-transaction.constants'

const paymentTransactionSchema = new Schema<IPaymentTransactionDoc>(
  {
    transactionId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    booking: {
      type: Schema.Types.ObjectId,
      ref: 'Booking',
      required: true,
      index: true,
    },
    bookingGroupId: {
      type: String,
      trim: true,
      index: true,
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    artist: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    stripeConnectedAccountId: {
      type: String,
      trim: true,
    },
    type: {
      type: String,
      enum: PAYMENT_TRANSACTION_TYPE_VALUES,
      required: true,
      index: true,
    },
    gateway: {
      type: String,
      enum: PAYMENT_GATEWAY_VALUES,
      default: PAYMENT_GATEWAY.STRIPE_CONNECT,
      required: true,
    },
    status: {
      type: String,
      enum: PAYMENT_STATUS_VALUES,
      default: PAYMENT_STATUS.PENDING,
      required: true,
      index: true,
    },
    currency: {
      type: String,
      default: 'AUD',
      uppercase: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    platformCreditUsed: {
      type: Number,
      default: 0,
      min: 0,
    },
    marketplaceFee: {
      type: Number,
      default: 0,
      min: 0,
    },
    marketplaceFeeGst: {
      type: Number,
      default: 0,
      min: 0,
    },
    stripeFeeBorne: {
      type: Number,
      default: 0,
      min: 0,
    },
    artistNetShare: {
      type: Number,
      default: 0,
      min: 0,
    },
    stripePaymentIntentId: {
      type: String,
      trim: true,
      index: true,
    },
    stripeChargeId: {
      type: String,
      trim: true,
    },
    stripeTransferId: {
      type: String,
      trim: true,
    },
    stripeRefundId: {
      type: String,
      trim: true,
    },
    paymentMethodDetails: {
      brand: { type: String },
      last4: { type: String },
      expMonth: { type: Number },
      expYear: { type: Number },
    },
    receiptUrl: {
      type: String,
      trim: true,
    },
    failureReason: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
)

export const PaymentTransaction = model<IPaymentTransactionDoc>(
  'PaymentTransaction',
  paymentTransactionSchema
)
