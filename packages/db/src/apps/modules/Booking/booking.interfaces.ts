import { Document, Types } from 'mongoose'
import type {
  TBookingStatus,
  TPaymentStageStatus,
  TVisitType,
} from './booking.constants'

export interface IServiceLocationSnapshot {
  address: string
  suburb?: string | null | undefined
  state?: string | null | undefined
  postalCode?: string | null | undefined
  coordinates?: [number, number] | null | undefined // [lng, lat]
}

export interface IPaymentStage {
  percentage: number
  amount: number
  status: TPaymentStageStatus
  stripePaymentIntentId?: string | null | undefined
  stripeReceiptUrl?: string | null | undefined
  paidAt?: Date | null | undefined
  failedAt?: Date | null | undefined
  dueDate?: Date | null | undefined
  rectificationDeadline?: Date | null | undefined
}

export interface IBooking {
  bookingNumber: string
  bookingGroupId?: string | null | undefined
  customer: Types.ObjectId
  artist: Types.ObjectId
  service: Types.ObjectId

  // Location:
  visitType: TVisitType
  address?: Types.ObjectId | null | undefined
  serviceLocationSnapshot?: IServiceLocationSnapshot | null | undefined

  // Schedule:
  bookingDate: Date
  startTime: string // "HH:mm" (e.g. "10:00")
  endTime: string // "HH:mm" (e.g. "11:30")
  durationMinutes: number
  guestCount: number

  // Status Lifecycle:
  status: TBookingStatus
  isQuickBooking: boolean

  // Financial Breakdown (AUD):
  servicePrice: number
  travelFee: number
  parkingFee: number
  grossAmount: number
  discountAmount: number
  platformCreditApplied: number
  gstAmount: number // 10% on service if artist registered
  stripeGstTaxRateId?: string | null | undefined
  totalBookingPrice: number // Final customer payable amount

  // 20% Initial Deposit:
  initialPayment: IPaymentStage

  // 80% Balance Payment:
  balancePayment: IPaymentStage

  // Saved Payment Details:
  stripeCustomerId?: string | null | undefined
  stripePaymentMethodId?: string | null | undefined
  stripeInvoiceId?: string | null | undefined
  stripeInvoiceUrl?: string | null | undefined
  stripeInvoicePdf?: string | null | undefined

  // Artist Platform Fee / RCTI Invoice:
  artistStripeInvoiceId?: string | null | undefined
  artistStripeInvoiceUrl?: string | null | undefined
  artistStripeInvoicePdf?: string | null | undefined

  // Marketplace & Processing Fee Sharing:
  platformCommissionPercentage: number // 20%
  platformCommissionAmount: number
  platformCommissionGst: number // 10% on platform commission
  stripeInitialFee: number // Absorbed by platform
  stripeBalanceFee: number // Absorbed by artist
  artistNetPayout: number // Net transferred to artist on completion

  // Promotion & Credits:
  promoCode?: Types.ObjectId | null | undefined
  promoCodeText?: string | null | undefined

  // Cancellation:
  cancelledBy?: Types.ObjectId | null | undefined
  cancelledByRole?: 'customer' | 'artist' | 'admin' | 'system' | null | undefined
  cancellationReason?: string | null | undefined
  cancelledAt?: Date | null | undefined
  cancellationFeeCharged?: number | null | undefined
  platformCreditIssued?: number | null | undefined
  depositForfeited?: boolean | null | undefined
  creditNoteId?: string | null | undefined
  creditNotePdfUrl?: string | null | undefined

  // Service Completion Details (Figma Artist/20.png):
  completionDetails?: ICompletionDetails | null | undefined

  // No-Show Details (Customer No-Show / Safety Refusal):
  noShowDetails?: INoShowDetails | null | undefined

  // Reschedule Request & Status (Figma customer/37.png & Artist/16.png):
  rescheduleRequest?: IRescheduleRequest | null | undefined

  // Notes:
  clientNotes?: string | null | undefined
  artistNotes?: string | null | undefined

  createdAt?: Date | undefined
  updatedAt?: Date | undefined
}

export interface INoShowDetails {
  reportedBy: Types.ObjectId
  reportedAt: Date
  reason?: string | null | undefined
  isSafetyConcern?: boolean | null | undefined
  verifiedBy?: Types.ObjectId | null | undefined
  verifiedAt?: Date | null | undefined
  isApproved?: boolean | null | undefined
  adminNotes?: string | null | undefined
}

export interface ICompletionDetails {
  servicesPerformed?: string | null | undefined
  productsUsed?: string | null | undefined
  totalWorkingTime?: string | null | undefined
  specialNotes?: string | null | undefined
  proofPhotos?: string[] | null | undefined
  customerSignature?: string | null | undefined
  completedAt?: Date | null | undefined
}

export interface IRescheduleRequest {
  requestedBy: Types.ObjectId
  requestedByRole: 'customer' | 'artist'
  newDate: Date
  newStartTime: string
  newEndTime: string
  reason: string
  message?: string | null | undefined
  status: 'pending' | 'accepted' | 'declined'
  createdAt: Date
  respondedAt?: Date | null | undefined
  declineReason?: string | null | undefined
}

export interface IBookingDoc extends Document, IBooking {}
