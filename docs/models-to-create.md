# 🗄️ Database Models Specification: **memillennial**

This document provides the complete, authoritative specification of all **14 new database models** that need to be created in `@repo/db` (`packages/db/src/apps/modules/`) to fulfill the requirements of [final-docs.md](file:///c:/Users/Mostafizur%20Rahaman/Desktop/tss_workspace/mimilini-booking-platform/docs/final-docs.md), along with enhancements to existing models.

---

## 📊 Summary of Models Architecture

```
                               ┌───────────────────────────────┐
                               │       User (Auth & Roles)     │
                               └───────┬───────────────┬───────┘
                                       │               │
                     ┌─────────────────┴─┐           ┌─┴─────────────────┐
                     ▼                   ▼           ▼                   ▼
           ┌──────────────────┐ ┌───────────────┐ ┌──────────────┐ ┌─────────────┐
           │  ArtistProfile   │ │Address/Pref.  │ │    Wallet    │ │SavedArtist  │
           └─────────┬────────┘ └───────────────┘ └──────┬───────┘ └─────────────┘
                     │                                   │
                     ▼                                   ▼
           ┌──────────────────┐                  ┌───────────────┐
           │  ArtistServices  │                  │ WalletLedger  │
           └─────────┬────────┘                  └───────────────┘
                     │
                     ▼
           ┌─────────────────────────────────────────────────────────────┐
           │                      Booking (Core Hub)                     │
           └──────┬──────────────┬──────────────┬──────────────┬─────────┘
                  │              │              │              │
                  ▼              ▼              ▼              ▼
           ┌─────────────┐┌─────────────┐┌─────────────┐┌──────────────┐
           │  Payment-   ││   Booking-  ││   Refund    ││ Conversation │
           │ Transaction ││ Completion  ││ & Disputes ││ & ChatMessage│
           └─────────────┘└─────────────┘└─────────────┘└──────┬───────┘
                                                               │
                                                               ▼
           ┌─────────────┐┌─────────────┐┌─────────────┐┌──────────────┐
           │   Review    ││CustomerStory││  Promotion  ││SupportTicket │
           └─────────────┘└─────────────┘└─────────────┘└──────────────┘
```

---

## 📑 Complete Catalog of Models to Create

| # | Model Name | Collection Name | Primary Purpose | Associated Module |
|---|------------|-----------------|-----------------|-------------------|
| **1** | `Booking` | `bookings` | Core appointment record, pricing ledger, lifecycle states | Module 5, 6, 7 |
| **2** | `BookingCompletion` | `bookingcompletions` | Digital sign-off, client signature, duration & proof photos | Module 6 |
| **3** | `PaymentTransaction` | `paymenttransactions` | Financial gateway ledger, Stripe charges, split records | Module 5, 12 |
| **4** | `Refund` | `refunds` | 48-Hour cancellation policy tracking & $15 compensation | Module 7, 13 |
| **5** | `Wallet` | `wallets` | In-app digital wallet balance for Customers & Artists | Module 12 |
| **6** | `WalletLedger` | `walletledgers` | Audit trail of all wallet credits, debits, compensations | Module 12 |
| **7** | `ArtistBankAccount` | `artistbankaccounts` | Australian BSB and bank account verification for Artists | Module 12 |
| **8** | `ArtistPayout` | `artistpayouts` | Withdrawal requests (minimum $500 AUD threshold) & approval | Module 12, 13 |
| **9** | `Review` | `reviews` | Multidimensional feedback, ratings (1-5), compliment chips | Module 9, 13 |
| **10** | `CustomerStory` | `customerstories` | Draggable Before-and-After transformation slider stories | Module 4 |
| **11** | `Conversation` | `conversations` | 1:1 In-app chat room pinned to active Booking ID & Date | Module 8 |
| **12** | `ChatMessage` | `chatmessages` | Chat messages with photo attachments and read receipts | Module 8 |
| **13** | `Promotion` | `promotions` | Artist discount promo codes (e.g. `GLOW20`, `LOYAL15`) | Module 11 |
| **14** | `SavedArtist` | `savedartists` | Customer favorite artists bookmarks | Module 10 |
| **15** | `SupportTicket` | `supporttickets` | Incident reporting, dispute resolutions, and issue tickets | Module 10, 13 |
| **16** | `PlatformSettings` | `platformsettings` | Admin dynamic commission % (15%, 18%, 12%), policy settings | Module 13 |
| **17** | `NotificationCampaign` | `notificationcampaigns` | Omnichannel email/push broadcasts & scheduled campaigns | Module 13 |

---

## 🛠️ Detailed Model Specifications

---

### 1. `Booking` Model (`bookings`)
**Purpose:** Represents an end-to-end appointment between a Customer and an Artist, strictly adhering to the 20%/80% payment schedule, Stripe Connect integration, and dual-contract architecture.

```typescript
// packages/db/src/apps/modules/Booking/booking.interfaces.ts

export type TVisitType = 'home_visit' | 'salon_visit';
export type TBookingStatus = 
  | 'requested'                 // Awaiting artist review (if quick booking disabled)
  | 'confirmed'                 // Accepted by artist or instant confirmed
  | 'initial_paid'              // 20% Initial Payment captured
  | 'balance_pending'           // Awaiting 80% balance payment (scheduled 24h prior)
  | 'paid'                      // 100% (Initial + Balance) paid
  | 'balance_payment_failed'    // 80% failed; in 2-4hr rectification window
  | 'in_progress'               // Artist started service
  | 'completed'                 // Service finished & client signed off
  | 'cancelled'                 // Cancelled by client or artist
  | 'rescheduled';              // Date/time changed

export type TPaymentStageStatus = 'pending' | 'authorized' | 'captured' | 'failed' | 'refunded';

export interface IBooking {
  bookingNumber: string;               // e.g. "BK-202610-0012" (indexed, unique)
  customer: Types.ObjectId;           // ref: 'User'
  artist: Types.ObjectId;             // ref: 'User'
  service: Types.ObjectId;            // ref: 'ArtistServices'
  
  // Visit & Location details:
  visitType: TVisitType;
  address?: Types.ObjectId;           // ref: 'Address' (required if home_visit)
  serviceLocationSnapshot?: {
    address: string;
    suburb: string;
    state: string;
    postalCode: string;
    coordinates: [number, number];    // [lng, lat]
  };

  // Schedule:
  bookingDate: Date;                  // Appointment date (YYYY-MM-DD)
  startTime: string;                  // "10:00"
  endTime: string;                    // "11:30"
  durationMinutes: number;            // 90
  guestCount: number;                 // 1 to 10+ (default 1)

  // Status Lifecycle:
  status: TBookingStatus;
  isQuickBooking: boolean;

  // Pricing (AUD):
  servicePrice: number;               // Professional service fee
  discountAmount: number;             // Applied promo code or platform credit
  gstAmount: number;                  // Australian GST component (included or calculated)
  totalBookingPrice: number;          // Total amount payable by Customer (servicePrice - discountAmount)

  // 20% Initial Payment:
  initialPayment: {
    percentage: 20;                   // 20% of totalBookingPrice
    amount: number;                   // In AUD
    status: TPaymentStageStatus;
    stripePaymentIntentId?: string;
    paidAt?: Date;
  };

  // 80% Balance Payment (due ~24 hours before appointment):
  balancePayment: {
    percentage: 80;                   // 80% of totalBookingPrice
    amount: number;                   // In AUD
    dueDate: Date;                    // Approximately 24 hours before appointment
    status: TPaymentStageStatus;
    stripePaymentIntentId?: string;
    paidAt?: Date;
    failedAt?: Date;
    rectificationDeadline?: Date;     // 2 to 4 hours from failedAt
  };

  // Saved Payment Method (for off-session balance capture):
  stripeCustomerId?: string;
  stripePaymentMethodId?: string;

  // Platform Marketplace Facilitation Fee (from Professional Terms):
  marketplaceFacilitationFeeRate: 20; // 20% of Professional Services
  marketplaceFacilitationFee: number; // 20% deducted from Professional
  marketplaceFacilitationFeeGst: number; // 10% GST on the facilitation fee
  artistNetPayout: number;            // Total Collected - Facilitation Fee - Fee GST - Stripe fees

  // Promotion & Credits:
  promotion?: Types.ObjectId;         // ref: 'Promotion'
  platformCreditApplied?: number;     // Platform Credit redeemed (AUD)

  // Consultation & Health Notes:
  consultationNotes?: string;         // Allergies, sensitive skin, vegan products
  ceremonyTimeline?: string;          // Specific timing notes

  // Cancellation Details:
  cancelledBy?: Types.ObjectId;       // ref: 'User'
  cancelledByRole?: 'customer' | 'artist' | 'admin';
  cancellationReason?: string;
  cancelledAt?: Date;
  cancellationFeeCharged?: number;    // e.g. 50% for late cancellation
  platformCreditIssued?: number;      // Amount credited back to Customer
  rescheduledFromBooking?: Types.ObjectId; // ref: 'Booking'

  createdAt: Date;
  updatedAt: Date;
}
```

---

### 2. `BookingCompletion` Model (`bookingcompletions`)
**Purpose:** Handles US-6.3 and US-6.4 (digital proof, products used, and on-screen client signature).

```typescript
// packages/db/src/apps/modules/BookingCompletion/booking-completion.interfaces.ts

export interface IBookingCompletion {
  booking: Types.ObjectId;            // ref: 'Booking' (unique)
  artist: Types.ObjectId;             // ref: 'User'
  customer: Types.ObjectId;           // ref: 'User'

  // Verification & Sign-off data:
  actualDurationMinutes: number;      // e.g. 165 mins (2h 45m)
  productsUsed: string[];             // ['Charlotte Tilbury Pillow Talk', 'MAC Studio Fix']
  proofPhotos: string[];              // Up to 6 photos uploaded to S3
  customerSignatureUrl: string;       // S3 URL of on-screen drawn signature
  completionNotes?: string;           // Artist internal notes

  signedAt: Date;                     // Timestamp of signature
  completedAt: Date;
}
```

---

### 3. `PaymentTransaction` Model (`paymenttransactions`)
**Purpose:** Records gateway transactions (Stripe Connect charges, balance collections, and fee splits).

```typescript
// packages/db/src/apps/modules/PaymentTransaction/payment-transaction.interfaces.ts

export type TPaymentTransactionType = 
  | 'initial_20_percent' 
  | 'balance_80_percent' 
  | 'full_upfront' 
  | 'late_cancellation_fee' 
  | 'no_show_fee';

export type TPaymentGateway = 'stripe_connect' | 'platform_credit';
export type TTransactionStatus = 'pending' | 'succeeded' | 'failed' | 'refunded';

export interface IPaymentTransaction {
  transactionId: string;              // e.g. "pi_3N..." or internal UUID
  booking: Types.ObjectId;            // ref: 'Booking'
  customer: Types.ObjectId;           // ref: 'User'
  artist: Types.ObjectId;             // ref: 'User'
  stripeConnectedAccountId?: string;  // Professional's Stripe account

  transactionType: TPaymentTransactionType;
  gateway: TPaymentGateway;
  grossAmount: number;                // In AUD
  marketplaceFacilitationFee: number; // 20%
  marketplaceFacilitationFeeGst: number; // 10% on facilitation fee
  artistNetPayout: number;            // Released to connected account
  
  stripePaymentIntentId?: string;
  stripeChargeId?: string;
  paymentMethodDetails?: {
    brand: string;                    // "visa", "mastercard"
    last4: string;                    // "4242"
    expMonth: number;
    expYear: number;
  };

  status: TTransactionStatus;
  receiptUrl?: string;                // Compliant tax invoice / RCTI link
  createdAt: Date;
}
```

---

### 4. `Refund` & `PlatformCredit` Models (`refunds`, `platformcredits`)
**Purpose:** Handles legal cancellation policy (24-hour threshold, 50% fee / 50% credit, 36-month minimum expiry).

```typescript
// packages/db/src/apps/modules/Refund/refund.interfaces.ts

export type TRefundPolicyApplied = 
  | 'customer_cancellation_more_than_24h' // Amount paid issued as Platform Credit less Admin Fee
  | 'customer_cancellation_less_than_24h' // 50% cancellation fee, 50% Platform Credit
  | 'customer_no_show_or_safety_hazard'   // 100% charged/retained, 0% credit
  | 'customer_late_arrival_over_20m'      // 50% cancellation fee, 50% Platform Credit
  | 'professional_cancellation_prompt_refund' // 100% prompt cash refund to original card
  | 'professional_cancellation_platform_credit'; // 100% issued as Platform Credit (customer choice)

export type TRefundStatus = 'pending' | 'approved' | 'processed' | 'rejected';

export interface IRefund {
  refundNumber: string;               // e.g. "RF-202610-0045"
  booking: Types.ObjectId;            // ref: 'Booking'
  customer: Types.ObjectId;           // ref: 'User'
  artist: Types.ObjectId;             // ref: 'User'
  processedBy?: Types.ObjectId;       // ref: 'User' (Admin or System)

  reason: string;                     // "Change of mind", "Health issue", "Professional cancellation"
  cancelledByRole: 'customer' | 'artist' | 'admin';
  hoursBeforeAppointment: number;     // e.g. 36 hours vs 12 hours
  policyApplied: TRefundPolicyApplied;

  cashRefundAmount: number;           // Refunded back to card via Stripe (AUD)
  adminFeeDeducted: number;           // Reasonable admin fee for cancellation > 24h
  platformCreditIssued: number;       // Credit issued (AUD)

  status: TRefundStatus;
  stripeRefundId?: string;
  adminNotes?: string;

  createdAt: Date;
  processedAt?: Date;
}

// packages/db/src/apps/modules/PlatformCredit/platform-credit.interfaces.ts

export interface IPlatformCredit {
  customer: Types.ObjectId;           // ref: 'User'
  balance: number;                    // Available AUD credit
  currency: 'AUD';
  expiresAt: Date;                    // Minimum 36 months from issue date (mandatory)
  sourceBooking?: Types.ObjectId;     // ref: 'Booking'
  sourceReason: string;
  isRedeemed: boolean;
  redeemedAt?: Date;
  createdAt: Date;
}
```

---

### 5 & 6. `Wallet` & `WalletLedger` Models (`wallets`, `walletledgers`)
**Purpose:** Manages Platform Credits for Customers and withdrawable earnings ledger for Professionals.

```typescript
// packages/db/src/apps/modules/Wallet/wallet.interfaces.ts

export interface IWallet {
  user: Types.ObjectId;               // ref: 'User' (unique)
  userRole: 'customer' | 'artist';
  balance: number;                    // Available AUD balance
  pendingBalance: number;             // Pending clearance (e.g. before service completion)
  currency: 'AUD';
  isActive: boolean;
}

export type TLedgerEntryType = 'credit' | 'debit';
export type TLedgerSource = 
  | 'initial_payment_earning'
  | 'balance_payment_earning'
  | 'cancellation_fee_earning'
  | 'cancellation_platform_credit'     // 36-month credit
  | 'professional_cancellation_remedy'
  | 'stripe_connect_payout'
  | 'booking_checkout_redemption';

export interface IWalletLedger {
  wallet: Types.ObjectId;             // ref: 'Wallet'
  user: Types.ObjectId;               // ref: 'User'
  entryType: TLedgerEntryType;
  source: TLedgerSource;
  amount: number;                     // AUD
  balanceBefore: number;
  balanceAfter: number;
  referenceBooking?: Types.ObjectId;  // ref: 'Booking'
  referenceRefund?: Types.ObjectId;   // ref: 'Refund'
  expiresAt?: Date;                   // For platform credits (min 36 months)
  description: string;
  createdAt: Date;
}
```

---

### 7 & 8. `ArtistBankAccount` & `ArtistPayout` Models
**Purpose:** US-12.2 (Australian bank accounts with BSB & withdrawal requests $\ge$ $500 AUD).

```typescript
// packages/db/src/apps/modules/Payout/payout.interfaces.ts

export interface IArtistBankAccount {
  artist: Types.ObjectId;             // ref: 'User'
  accountHolderName: string;
  bsb: string;                        // Australian 6-digit BSB (e.g. "083-004")
  accountNumber: string;              // Australian account number
  bankName: string;                   // e.g. "NAB", "Commonwealth Bank"
  isDefault: boolean;
  isVerified: boolean;
}

export type TPayoutStatus = 'pending' | 'approved' | 'processing' | 'completed' | 'rejected';

export interface IArtistPayout {
  payoutNumber: string;               // e.g. "PO-202610-0033"
  artist: Types.ObjectId;             // ref: 'User'
  bankAccount: Types.ObjectId;        // ref: 'ArtistBankAccount'
  amount: number;                     // Min 500 AUD
  status: TPayoutStatus;
  rejectionReason?: string;
  processedBy?: Types.ObjectId;       // ref: 'User' (Admin)
  processedAt?: Date;
  bankTransferReference?: string;
  createdAt: Date;
}
```

---

### 9. `Review` Model (`reviews`)
**Purpose:** US-9.1, US-9.2, US-13.6 (Multi-attribute reviews, compliments chips, photos, report queue).

```typescript
// packages/db/src/apps/modules/Review/review.interfaces.ts

export type TReviewAttributeChip = 
  | 'Friendly' 
  | 'Professional' 
  | 'Punctual' 
  | 'Hygienic' 
  | 'Great Comm.' 
  | 'Skilled' 
  | 'Attentive' 
  | 'Good Vibes' 
  | 'Well Equipped';

export type TReviewModerationStatus = 'approved' | 'flagged' | 'hidden' | 'removed';

export interface IReview {
  booking: Types.ObjectId;            // ref: 'Booking' (unique: 1 review per booking)
  customer: Types.ObjectId;           // ref: 'User'
  artist: Types.ObjectId;             // ref: 'User'
  service: Types.ObjectId;            // ref: 'ArtistServices'

  rating: number;                     // 1 to 5 integer
  attributeChips: TReviewAttributeChip[];
  testimonial: string;
  proofPhotos: string[];              // Up to 6 before/after photos

  // Admin Moderation & Community Reporting (US-13.6):
  reportCount: number;                // e.g. 8 reports
  reportReasons: string[];            // ["SCAM ARTIST alert", "Offensive language"]
  moderationStatus: TReviewModerationStatus;
  moderationNote?: string;
  moderatedBy?: Types.ObjectId;       // ref: 'User'

  createdAt: Date;
  updatedAt: Date;
}
```

---

### 10. `CustomerStory` Model (`customerstories`)
**Purpose:** US-4.4 (Testimonials with draggable before-and-after comparison slider).

```typescript
// packages/db/src/apps/modules/CustomerStory/customer-story.interfaces.ts

export interface ICustomerStory {
  artist: Types.ObjectId;             // ref: 'User'
  customer?: Types.ObjectId;          // ref: 'User' (optional if curated)
  title: string;                      // e.g. "Chloe's Rustic Vineyard Wedding"
  occasion: 'Wedding' | 'Formal' | 'Natural' | 'Party' | 'Luxury Glam' | 'Festival';
  testimonial: string;
  beforeImageUrl: string;             // Left image for comparison slider
  afterImageUrl: string;              // Right image for comparison slider
  isFeatured: boolean;
  sortOrder: number;
}
```

---

### 11 & 12. `Conversation` & `ChatMessage` Models (`conversations`, `chatmessages`)
**Purpose:** US-8.1, US-8.2, US-8.3 (Contextual 1:1 chat pinned to active Booking ID & Date).

```typescript
// packages/db/src/apps/modules/Chat/chat.interfaces.ts

export interface IConversation {
  booking: Types.ObjectId;            // ref: 'Booking' (Pinned Booking context)
  participants: Types.ObjectId[];     // [customer User ID, artist User ID]
  lastMessage?: string;
  lastMessageAt?: Date;
  isActive: boolean;
}

export interface IChatMessage {
  conversation: Types.ObjectId;       // ref: 'Conversation'
  sender: Types.ObjectId;             // ref: 'User'
  messageType: 'text' | 'image' | 'file' | 'system_alert';
  text?: string;
  attachmentUrls: string[];
  isRead: boolean;
  readAt?: Date;
  createdAt: Date;
}
```

---

### 13. `Promotion` Model (`promotions`)
**Purpose:** US-11.1, US-11.2 (Artist campaign discount codes e.g. `GLOW20`).

```typescript
// packages/db/src/apps/modules/Promotion/promotion.interfaces.ts

export type TDiscountType = 'percentage' | 'fixed_aud';
export type TTargetEligibility = 'all_clients' | 'repeat_clients_only' | 'group_bookings';

export interface IPromotion {
  artist: Types.ObjectId;             // ref: 'User' (null for global platform code)
  code: string;                       // e.g. "GLOW20" (uppercase, indexed)
  discountType: TDiscountType;
  discountValue: number;              // 20 (%) or 25 ($ AUD)
  minBookingSpend: number;            // e.g. $100 AUD
  maxDiscountAmount?: number;         // Cap on discount
  maxUsageCount: number;              // e.g. 50 uses
  usedCount: number;                  // default 0
  targetEligibility: TTargetEligibility;
  startDate: Date;
  endDate: Date;
  isActive: boolean;
}
```

---

### 14. `SavedArtist` Model (`savedartists`)
**Purpose:** US-10.2 (Customer bookmarks and favorite artists list).

```typescript
// packages/db/src/apps/modules/SavedArtist/saved-artist.interfaces.ts

export interface ISavedArtist {
  customer: Types.ObjectId;           // ref: 'User'
  artist: Types.ObjectId;             // ref: 'User'
  createdAt: Date;
}
// Unique compound index: { customer: 1, artist: 1 }
```

---

### 15. `SupportTicket` Model (`supporttickets`)
**Purpose:** US-10.5 (Incident reporting, AEST business hours ticketing, disputes).

```typescript
// packages/db/src/apps/modules/SupportTicket/support-ticket.interfaces.ts

export type TTicketCategory = 'booking_issue' | 'payment_problem' | 'artist_issue' | 'technical_bug' | 'other';
export type TTicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export type TTicketPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface ISupportTicket {
  ticketNumber: string;               // e.g. "TCK-202610-0012"
  user: Types.ObjectId;               // ref: 'User'
  booking?: Types.ObjectId;           // ref: 'Booking' (optional)
  category: TTicketCategory;
  subject: string;
  description: string;
  attachments: string[];              // S3 URLs
  status: TTicketStatus;
  priority: TTicketPriority;
  assignedAdmin?: Types.ObjectId;     // ref: 'User'
  adminNotes?: string;
  resolvedAt?: Date;
  createdAt: Date;
}
```

---

### 16. `PlatformSettings` Model (`platformsettings`)
**Purpose:** US-13.5 (Super Admin dynamic commission & threshold configuration).

```typescript
// packages/db/src/apps/modules/PlatformSettings/platform-settings.interfaces.ts

export interface IPlatformSettings {
  standardCommissionPercentage: number;   // default: 15
  homeVisitCommissionRate: number;        // default: 18
  salonVisitCommissionRate: number;       // default: 12
  minWithdrawalThresholdAUD: number;      // default: 500
  cancellationFullRefundHours: number;    // default: 48
  artistCancellationCompensationAUD: number; // default: 15
  updatedBy: Types.ObjectId;             // ref: 'User'
  updatedAt: Date;
}
```

---

### 17. `NotificationCampaign` Model (`notificationcampaigns`)
**Purpose:** US-13.7 (Super Admin Omnichannel broadcast marketing).

```typescript
// packages/db/src/apps/modules/NotificationCampaign/notification-campaign.interfaces.ts

export type TTargetAudience = 'all_users' | 'customers_only' | 'artists_only' | 'verified_artists_only';
export type TCampaignChannel = 'email' | 'push';
export type TCampaignStatus = 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed';

export interface INotificationCampaign {
  title: string;
  body: string;
  htmlContent?: string;
  channels: TCampaignChannel[];
  targetAudience: TTargetAudience;
  scheduledAt?: Date;
  sentAt?: Date;
  status: TCampaignStatus;
  stats: {
    totalTargeted: number;
    sentCount: number;
    deliveredCount: number;
    failedCount: number;
  };
  createdBy: Types.ObjectId;          // ref: 'User'
}
```

---

## 🔄 Enhancements Required on Existing Models

1. **`ArtistProfile` (`artist-profile.interfaces.ts`)**:
   - Add `certifications: string[]` (up to 20 certifications, e.g. MAC Pro, CIDESCO).
   - Add `preferredBrands: string[]` (e.g. Charlotte Tilbury, NARS).
   - Add `publicLiabilityInsuranceUrl: string` ($10M insurance document).
   - Add `insuranceExpiryDate: Date`.
   - Add `isInsuranceVerified: boolean`.

2. **`ArtistServices` (`artist-services.interfaces.ts`)**:
   - Add `promotionalDiscount: { isDiscounted: boolean; discountPercent: number }`.
