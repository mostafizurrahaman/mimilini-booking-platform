import { Schema, model } from 'mongoose'
import type { IBookingDoc } from './booking.interfaces'
import {
  BOOKING_STATUS,
  BOOKING_STATUS_VALUES,
  PAYMENT_STAGE_STATUS,
  PAYMENT_STAGE_STATUS_VALUES,
  VISIT_TYPE,
  VISIT_TYPE_VALUES,
} from './booking.constants'

const paymentStageSchema = new Schema(
  {
    percentage: { type: Number, required: true },
    amount: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: PAYMENT_STAGE_STATUS_VALUES,
      default: PAYMENT_STAGE_STATUS.PENDING,
    },
    stripePaymentIntentId: { type: String, trim: true },
    stripeReceiptUrl: { type: String, trim: true, default: null },
    paidAt: { type: Date },
    failedAt: { type: Date },
    dueDate: { type: Date },
    rectificationDeadline: { type: Date },
  },
  { _id: false, versionKey: false }
)

const completionDetailsSchema = new Schema(
  {
    servicesPerformed: { type: String, trim: true },
    productsUsed: { type: String, trim: true },
    totalWorkingTime: { type: String, trim: true },
    specialNotes: { type: String, trim: true },
    proofPhotos: { type: [String], default: [] },
    customerSignature: { type: String, trim: true },
    completedAt: { type: Date },
    signedAt: { type: Date },
    payoutTransferredAt: { type: Date },
  },
  { _id: false, versionKey: false }
)

const rescheduleRequestSchema = new Schema(
  {
    requestedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    requestedByRole: { type: String, enum: ['customer', 'artist'], required: true },
    newDate: { type: Date, required: true },
    newStartTime: { type: String, required: true, trim: true },
    newEndTime: { type: String, required: true, trim: true },
    reason: { type: String, required: true, trim: true },
    message: { type: String, trim: true },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'declined'],
      default: 'pending',
    },
    createdAt: { type: Date, default: Date.now },
    respondedAt: { type: Date },
    declineReason: { type: String, trim: true },
  },
  { _id: false, versionKey: false }
)

const noShowDetailsSchema = new Schema(
  {
    reportedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    reportedAt: { type: Date, default: Date.now },
    reason: { type: String, trim: true },
    isSafetyConcern: { type: Boolean, default: false },
    verifiedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    verifiedAt: { type: Date },
    isApproved: { type: Boolean, default: false },
    adminNotes: { type: String, trim: true },
  },
  { _id: false, versionKey: false }
)

const bookingSchema = new Schema<IBookingDoc>(
  {
    bookingNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    bookingGroupId: {
      type: String,
      trim: true,
      index: true,
    },
    customer: {
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
    service: {
      type: Schema.Types.ObjectId,
      ref: 'ArtistServices',
      required: true,
    },
    visitType: {
      type: String,
      enum: VISIT_TYPE_VALUES,
      default: VISIT_TYPE.HOME_VISIT,
      required: true,
    },
    address: {
      type: Schema.Types.ObjectId,
      ref: 'Address',
    },
    serviceLocationSnapshot: {
      address: { type: String },
      suburb: { type: String },
      state: { type: String },
      postalCode: { type: String },
      coordinates: {
        type: [Number],
        index: '2dsphere',
      },
    },
    bookingDate: {
      type: Date,
      required: true,
      index: true,
    },
    startTime: {
      type: String,
      required: true,
      trim: true,
    },
    endTime: {
      type: String,
      required: true,
      trim: true,
    },
    durationMinutes: {
      type: Number,
      required: true,
      min: 1,
    },
    guestCount: {
      type: Number,
      default: 1,
      min: 1,
    },
    status: {
      type: String,
      enum: BOOKING_STATUS_VALUES,
      default: BOOKING_STATUS.REQUESTED,
      index: true,
    },
    isQuickBooking: {
      type: Boolean,
      default: false,
    },
    servicePrice: {
      type: Number,
      required: true,
      min: 0,
    },
    travelFee: {
      type: Number,
      default: 0,
      min: 0,
    },
    parkingFee: {
      type: Number,
      default: 0,
      min: 0,
    },
    grossAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    discountAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    platformCreditApplied: {
      type: Number,
      default: 0,
      min: 0,
    },
    gstAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    stripeGstTaxRateId: {
      type: String,
      trim: true,
      default: null,
    },
    totalBookingPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    initialPayment: {
      type: paymentStageSchema,
      required: true,
    },
    balancePayment: {
      type: paymentStageSchema,
      required: true,
    },
    stripeCustomerId: {
      type: String,
      trim: true,
    },
    stripePaymentMethodId: {
      type: String,
      trim: true,
    },
    stripeInvoiceId: {
      type: String,
      trim: true,
      default: null,
    },
    stripeInvoiceUrl: {
      type: String,
      trim: true,
      default: null,
    },
    stripeInvoicePdf: {
      type: String,
      trim: true,
      default: null,
    },
    artistStripeInvoiceId: {
      type: String,
      trim: true,
      default: null,
    },
    artistStripeInvoiceUrl: {
      type: String,
      trim: true,
      default: null,
    },
    artistStripeInvoicePdf: {
      type: String,
      trim: true,
      default: null,
    },
    platformCommissionPercentage: {
      type: Number,
      default: 20,
    },
    platformCommissionAmount: {
      type: Number,
      default: 0,
    },
    platformCommissionGst: {
      type: Number,
      default: 0,
    },
    stripeInitialFee: {
      type: Number,
      default: 0,
    },
    stripeBalanceFee: {
      type: Number,
      default: 0,
    },
    artistNetPayout: {
      type: Number,
      default: 0,
    },
    promoCode: {
      type: Schema.Types.ObjectId,
      ref: 'PromoCode',
    },
    promoCodeText: {
      type: String,
      trim: true,
      uppercase: true,
    },
    cancelledBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    cancelledByRole: {
      type: String,
      enum: ['customer', 'artist', 'admin', 'system'],
    },
    cancellationReason: {
      type: String,
      trim: true,
    },
    cancelledAt: {
      type: Date,
    },
    cancellationFeeCharged: {
      type: Number,
      default: 0,
    },
    platformCreditIssued: {
      type: Number,
      default: 0,
    },
    depositForfeited: {
      type: Boolean,
      default: false,
    },
    creditNoteId: {
      type: String,
      trim: true,
    },
    creditNotePdfUrl: {
      type: String,
      trim: true,
    },
    completionDetails: {
      type: completionDetailsSchema,
      default: null,
    },
    noShowDetails: {
      type: noShowDetailsSchema,
      default: null,
    },
    rescheduleRequest: {
      type: rescheduleRequestSchema,
      default: null,
    },
    clientNotes: {
      type: String,
      trim: true,
    },
    artistNotes: {
      type: String,
      trim: true,
    },
    adminNotes: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
)

// Compound Index to prevent double booking for the same artist on same date & time
bookingSchema.index(
  { artist: 1, bookingDate: 1, startTime: 1, status: 1 },
  { name: 'idx_artist_schedule_slot' }
)

export const Booking = model<IBookingDoc>('Booking', bookingSchema)
