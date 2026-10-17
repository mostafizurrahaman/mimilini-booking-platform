# 📑 Database Models Specification: Booking, Payment, Wallet & WalletTransaction

This document specifies the database schemas and relationships for **Booking**, **Payment**, **Wallet**, and **WalletTransaction** in `@repo/db` (`packages/db/src/apps/modules/`).

---

## 🏗️ Architecture & Entity Relationship

```
                          ┌────────────────────────┐
                          │   User (Client/Artist) │
                          └───────────┬────────────┘
                                      │
              ┌───────────────────────┼───────────────────────┐
              │ 1                     │ 1                     │ 1
              ▼                       ▼                       ▼
     ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
     │     Booking     │     │     Payment     │     │     Wallet      │
     └────────┬────────┘     └────────▲────────┘     └────────┬────────┘
              │                       │                       │ 1
              │ 1                     │ N                     ▼
              └───────────────────────┘              ┌─────────────────┐
               (linked by bookingId &                │WalletTransaction│
                shared bookingGroupId)               └─────────────────┘
```

---

## 1. `Booking` Model

**Purpose:** Tracks client appointments, appointment timings, service location, pricing calculation, and the 20%/80% payment schedule.

```typescript
import { Schema, model, Document, Types } from 'mongoose'

export type TVisitType = 'home_visit' | 'salon_visit'
export type TBookingStatus =
  | 'requested'               // Awaiting artist confirmation (if manual acceptance)
  | 'confirmed'               // Accepted by artist or instant booking
  | 'initial_paid'            // 20% deposit captured
  | 'balance_pending'         // Scheduled 24h prior to appointment
  | 'paid'                    // 100% paid (initial + balance captured)
  | 'balance_payment_failed'  // Balance charge failed; in 2-4h rectification window
  | 'in_progress'             // Service currently being delivered
  | 'completed'               // Digital sign-off & completion proof provided
  | 'cancelled'               // Cancelled by client or artist
  | 'rescheduled'

export interface IBooking extends Document {
  bookingNumber: string              // e.g. "BK-202610-0001" (unique, human-readable)
  bookingGroupId?: string            // Group transaction / cart ID for multi-service or bridal party checkout
  customer: Types.ObjectId           // ref: 'User' (Client)
  artist: Types.ObjectId             // ref: 'User' (Beauty Professional)
  service: Types.ObjectId            // ref: 'ArtistServices'
  
  // Location details:
  visitType: TVisitType
  address?: Types.ObjectId           // ref: 'Address' (required for home visits)
  serviceLocationSnapshot?: {
    address: string
    suburb: string
    state: string
    postalCode: string
    coordinates: [number, number]    // [lng, lat]
  }

  // Schedule:
  bookingDate: Date                  // Appointment date
  startTime: string                  // "10:00"
  endTime: string                    // "11:30"
  durationMinutes: number            // 90
  guestCount: number                 // default 1

  // Status Lifecycle:
  status: TBookingStatus
  isQuickBooking: boolean

  // Pricing Ledger (AUD):
  servicePrice: number               // Base price set by artist
  discountAmount: number             // Promo code or platform credit applied
  gstAmount: number                  // 10% GST component where applicable
  totalBookingPrice: number          // servicePrice - discountAmount

  // 20% Initial Deposit:
  initialPayment: {
    percentage: number               // 20
    amount: number                   // 20% of totalBookingPrice
    status: 'pending' | 'captured' | 'failed' | 'refunded'
    stripePaymentIntentId?: string
    paidAt?: Date
  }

  // 80% Balance Payment (due ~24h prior):
  balancePayment: {
    percentage: number               // 80
    amount: number                   // 80% of totalBookingPrice
    dueDate: Date                    // 24 hours before appointment
    status: 'pending' | 'captured' | 'failed' | 'refunded'
    stripePaymentIntentId?: string
    paidAt?: Date
    failedAt?: Date
    rectificationDeadline?: Date     // 2 to 4 hours after failedAt
  }

  // Saved Payment Details (for off-session balance capture):
  stripeCustomerId?: string
  stripePaymentMethodId?: string

  // Platform Commission Breakdown (20% fee + 10% GST on fee):
  marketplaceFacilitationFee: number     // 20% of totalBookingPrice
  marketplaceFacilitationFeeGst: number  // 10% of marketplaceFacilitationFee
  artistNetPayout: number                // Net amount payable to artist connected account

  // Credits & Vouchers:
  promotion?: Types.ObjectId             // ref: 'PromoCode'
  platformCreditApplied?: number         // Amount paid via Wallet Platform Credit

  // Cancellation Details:
  cancelledBy?: Types.ObjectId           // ref: 'User'
  cancelledByRole?: 'customer' | 'artist' | 'admin'
  cancellationReason?: string
  cancelledAt?: Date
  cancellationFeeCharged?: number
  platformCreditIssued?: number

  createdAt: Date
  updatedAt: Date
}
```

---

## 2. `Payment` Model

**Purpose:** Financial gateway ledger recording all Stripe transactions, split charges (20% deposit, 80% balance), group transactions, and Stripe Connect transfers.

```typescript
import { Schema, model, Document, Types } from 'mongoose'

export type TPaymentType = 
  | 'INITIAL_20'
  | 'BALANCE_80'
  | 'FULL_100'
  | 'CANCELLATION_FEE'
  | 'REFUND'

export type TPaymentStatus = 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'REFUNDED'
export type TPaymentGateway = 'stripe_connect' | 'platform_credit' | 'mixed'

export interface IPayment extends Document {
  transactionId: string              // Internal unique reference (e.g. "TXN-202610-001")
  booking: Types.ObjectId            // ref: 'Booking'
  bookingGroupId: string             // Common ID grouping cart items or multi-service bookings (indexed)
  user: Types.ObjectId               // ref: 'User' (Client/Payer)
  artist: Types.ObjectId             // ref: 'User' (Professional/Payee)
  stripeConnectedAccountId?: string  // Artist's Stripe Connected Account (acct_xxx)

  type: TPaymentType
  gateway: TPaymentGateway
  status: TPaymentStatus
  currency: string                   // Default: 'AUD'

  // Amounts (AUD):
  amount: number                     // Total gross charged for this transaction
  platformCreditUsed?: number        // Portioned from client's wallet
  marketplaceFee: number             // Platform facilitation fee
  marketplaceFeeGst: number          // GST on platform fee
  artistNetShare: number             // Net portion destined for artist

  // Stripe References:
  stripePaymentIntentId?: string     // pi_xxx
  stripeChargeId?: string            // ch_xxx
  stripeTransferId?: string          // tr_xxx (transfer to connected account upon completion)
  stripeRefundId?: string            // re_xxx (if refunded)
  
  paymentMethodDetails?: {
    brand?: string                   // "visa", "mastercard"
    last4?: string                   // "4242"
    expMonth?: number
    expYear?: number
  }

  receiptUrl?: string                // Stripe receipt / tax invoice URL
  failureReason?: string             // Detailed error message if payment failed
  createdAt: Date
  updatedAt: Date
}
```

> **Key Indexes:**
> - `{ bookingGroupId: 1 }` (fast retrieval of all charges belonging to a checkout session)
> - `{ booking: 1 }`
> - `{ stripePaymentIntentId: 1 }`

---

## 3. `Wallet` Model

**Purpose:** Tracks in-app digital balances (Platform Credits for Customers and withdrawable earnings balance for Artists).

```typescript
import { Schema, model, Document, Types } from 'mongoose'

export interface IWallet extends Document {
  user: Types.ObjectId               // ref: 'User' (unique, 1:1 with User)
  userRole: 'customer' | 'artist'
  balance: number                    // Current usable balance in AUD (e.g. 150.00)
  pendingBalance: number             // Funds in escrow / pending appointment completion
  currency: string                   // Default: 'AUD'
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}
```

> **Key Index:**
> - `{ user: 1 }` (unique)

---

## 4. `WalletTransaction` Model

**Purpose:** Immutable ledger recording every single credit or debit to a user's wallet. Under Australian Consumer Law, Platform Credits issued from cancellations must not expire earlier than **36 months (3 years)**.

```typescript
import { Schema, model, Document, Types } from 'mongoose'

export type TWalletTransactionType = 'CREDIT' | 'DEBIT'
export type TWalletSource =
  | 'CANCELLATION_CREDIT'            // Issued when booking cancelled >24h (3-year expiry)
  | 'BOOKING_PAYMENT'                // Spent as credit on a new booking
  | 'INITIAL_DEPOSIT_EARNING'        // Artist share credited
  | 'BALANCE_PAYMENT_EARNING'        // Artist share credited
  | 'STRIPE_PAYOUT'                  // Transferred to artist bank / Stripe account
  | 'ADMIN_ADJUSTMENT'               // Manual support gesture or dispute resolution
  | 'EXPIRED_CREDIT'                 // System write-off after 36 months

export interface IWalletTransaction extends Document {
  wallet: Types.ObjectId             // ref: 'Wallet'
  user: Types.ObjectId               // ref: 'User'
  booking?: Types.ObjectId           // ref: 'Booking' (if linked to a booking)
  bookingGroupId?: string            // Group transaction ID (if checkout spanned multiple services)

  type: TWalletTransactionType       // CREDIT (+), DEBIT (-)
  source: TWalletSource
  amount: number                     // Positive value in AUD
  balanceBefore: number              // Wallet balance before transaction
  balanceAfter: number               // Wallet balance after transaction

  expiresAt?: Date                   // Set to +36 months for CANCELLATION_CREDIT
  isExpired?: boolean
  description?: string               // Human-readable line item for user wallet history
  createdAt: Date
}
```

> **Key Indexes:**
> - `{ wallet: 1, createdAt: -1 }` (for pagination of user transaction statements)
> - `{ user: 1 }`
> - `{ expiresAt: 1, isExpired: 1 }` (for automatic credit expiry cron worker)
