# 💳 Booking & Payment Architecture Specification
## Based on Customer & Professional Legal Terms (STUNNER ALERT PTY LTD)

---

## 1. Legal & Regulatory Foundation

This specification is directly derived from the binding legal agreements:
- **Customer Terms:** [Customer Terms and conditions.pdf](file:///c:/Users/Mostafizur%20Rahaman/Desktop/tss_workspace/mimilini-booking-platform/docs/Customer%20Terms%20and%20conditions.pdf)
- **Professional Terms:** [Professional Terms and conditions.pdf](file:///c:/Users/Mostafizur%20Rahaman/Desktop/tss_workspace/mimilini-booking-platform/docs/Professional%20Terms%20and%20conditions.pdf)

### Core Parties & Dual Contract Structure
1. **Platform Operator:** STUNNER ALERT PTY LTD (ABN 88 701 443 129).
2. **Merchant of Record for Platform Fee:** STUNNER ALERT is the merchant of record **only** for the Marketplace Facilitation Fee (Platform Services).
3. **Merchant of Record for Professional Services:** The independent Professional (Artist) is the supplier and merchant of record for the Professional Services.
4. **Payment Facilitation Agency:** STUNNER ALERT acts as the limited payment collection agent for the Professional through **Stripe Connect**.

---

## 2. Transparent Pricing Ledger & Australian Consumer Law (ACL)

Before booking confirmation, the platform displays the service price, any applicable discount, and the total booking price:

$$\text{Total Booking Price} = \text{Service Price} - \text{Discount Amount}$$

*(GST included where applicable under Australian pricing law)*

### Platform Commission Split & Taxes:
- **Marketplace Facilitation Fee:** **20%** of the amount payable for Professional Services.
- **GST on Facilitation Fee:** **10% of the Facilitation Fee** is payable in addition.
- **Professional Net Payout:**
  $$\text{Professional Net Payout} = \text{Total Collected} - \text{Facilitation Fee (20%)} - \text{GST on Fee (2%)} - \text{Stripe Processing Fees}$$
- **RCTI (Recipient Created Tax Invoices):** STUNNER ALERT is legally authorized to generate compliant tax invoices and RCTIs on the Professional's behalf in compliance with ATO (Australian Taxation Office) requirements.

---

## 3. The 20% / 80% Payment Lifecycle Schedule

```
[ Customer Submits Booking ]
             │
             ▼
[ Booking Confirmed ] ──► Initial Payment (20%) Charged Immediately
             │            Payment Method Stored in Stripe Customer
             ▼
[ 24 Hours Before Appointment ] ──► Automated Balance Payment (80%) Charged
             │
             ├──► Succeeded ──► Booking Status: PAID ──► Professional Delivers Service
             │
             └──► Failed ──► 2 to 4 Hour Rectification Window
                                   │
                                   ├──► Customer Pays via Stripe "Pay Now" link ──► Resumed
                                   └──► Unpaid after deadline ──► Booking Cancelled
```

### 1. Initial Payment (20%):
- When the booking is confirmed (via artist acceptance or Quick Booking), **20% of Total Booking Price** is immediately captured via Stripe PaymentIntent.
- The customer's Stripe PaymentMethod is attached to a Stripe Customer object and saved with `setup_future_usage: 'off_session'` for the upcoming balance charge.

### 2. Balance Payment (80%):
- Scheduled **approximately 24 hours prior** to the booking's commencement time.
- A background scheduler / queue triggers off-session payment capture for the remaining **80%**.
- **Short-Notice Exception:** If a booking is created less than 24 hours before the appointment time, **100% of the Total Booking Price** is charged upfront at confirmation.

### 3. Balance Payment Failure & Rectification Flow:
- If off-session charge fails (insufficient funds, expired card):
  1. Booking status transitions to `balance_payment_failed`.
  2. Multi-channel notification is fired (Email, Push, SMS) containing a secure Stripe **"Pay Now"** session link.
  3. A **Rectification Window (2 to 4 hours)** is enforced.
  4. If payment is resolved within the window, status updates to `paid`.
  5. If unresolved when the window expires, the booking is automatically cancelled, and applicable late cancellation / no-show clauses apply.

---

## 4. Cancellations, Rescheduling, No-Shows & Platform Credits

The legal terms specify strict rules for cancellations and refunds:

| Cancellation Scenario | Trigger Condition | Financial Consequence | Customer Remedy | Professional Payout |
|:---|:---|:---|:---|:---|
| **Customer Cancellation** | $> 24$ hours before appointment | Amount paid retained less reasonable Admin Fee | **Platform Credit** for amount paid (minus admin fee) | No payout |
| **Customer Late Cancellation** | $< 24$ hours before appointment | **50% Late Cancellation Fee** of Total Booking Price | Remaining **50% issued as Platform Credit** | Share of cancellation fee minus 20% platform fee |
| **Customer No-Show** | Customer absent / fails to provide access | **100% of Total Booking Price** charged / retained | **0% Credit / 0% Refund** | 100% payout minus 20% platform fee |
| **Customer Late Arrival** | Customer $> 20$ mins late & artist cancels | **50% Cancellation Fee** applies | Remaining **50% issued as Platform Credit** | Share of cancellation fee |
| **Safety Refusal by Professional** | Unsafe premises / threats / intoxication | Treated as **Customer No-Show** | **100% charged / retained (0% credit)** | Professional payout protected |
| **Professional Cancellation** | Artist cancels / fails to attend | Full reversal / refund | **Choice of: 100% Cash Refund OR Platform Credit** | 0% payout (possible 1-star penalty) |

### Platform Credit Rules:
- **Minimum Expiry:** Must not expire earlier than **36 months (3 years)** from the date of issue.
- **Redemption:** Non-redeemable for cash; applied at checkout against future bookings on the platform.
- **Ledger Tracking:** Logged in the customer's `PlatformCredit` / `WalletLedger` account.

---

## 5. Stripe Connect Integration Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                       STUNNER ALERT                         │
│                    (Stripe Platform Account)                │
└──────────────┬───────────────────────────────┬──────────────┘
               │                               │
               ▼                               ▼
    ┌──────────────────────┐        ┌──────────────────────┐
    │  Customer Payments   │        │ Professional Payouts │
    │                      │        │                      │
    │ • Stripe Customer    │        │ • Stripe Express /   │
    │ • PaymentMethod      │        │   Custom Connected   │
    │ • PaymentIntent (20%)│        │   Account            │
    │ • PaymentIntent (80%)│        │ • Transfer / Payout  │
    └──────────────────────┘        └──────────────────────┘
```

### Stripe Connect Implementation Details:
1. **Account Type:** Stripe Connect **Express** or **Custom** accounts for Professionals.
2. **Onboarding Flow:**
   - Artist completes KYC in app.
   - Endpoint `POST /stripe/connect/onboard` creates a Stripe Connected Account (`accounts.create`) and returns an Account Link (`accountLinks.create`) for Stripe hosted onboarding.
   - Webhook `account.updated` listens for `charges_enabled: true` and `payouts_enabled: true`, setting `isStripeConnected: true` on `User`/`ArtistProfile`.
3. **Payment Collection Mode (Destination Charges / Transfers):**
   - Customer pays via Stripe PaymentIntent.
   - Platform collects payment.
   - Upon service completion sign-off, a Stripe Transfer moves the net 80% (Gross minus 20% platform fee minus 10% GST on fee) to the Professional's connected account.
   - Alternatively, use Destination Charges with `application_fee_amount = 20% fee + GST`.

---

## 6. Required Models & Fields Summary

### Updated `Booking` Fields:
- `totalBookingPrice`: number
- `servicePrice`: number
- `discountAmount`: number
- `gst`: number
- `initialPayment`:
  - `amount`: number (20%)
  - `status`: `'pending' | 'paid' | 'failed'`
  - `stripePaymentIntentId`: string
  - `paidAt`: Date
- `balancePayment`:
  - `amount`: number (80%)
  - `status`: `'pending' | 'paid' | 'failed'`
  - `dueDate`: Date (24 hours prior)
  - `stripePaymentIntentId`: string
  - `paidAt`: Date
  - `failedAt`: Date
  - `rectificationDeadline`: Date (2–4 hours after failure)
- `marketplaceFacilitationFee`: number (20%)
- `marketplaceFacilitationFeeGst`: number (10% of facilitation fee)
- `artistNetPayout`: number
- `cancellationStatus`:
  - `cancelledAt`: Date
  - `cancelledBy`: ObjectId (ref: User)
  - `cancellationFeeCharged`: number
  - `platformCreditIssued`: number
  - `refundAmount`: number

### Updated `PlatformCredit` / `WalletLedger` Fields:
- `user`: ObjectId (ref: User)
- `balance`: number
- `expiresAt`: Date (created + 36 months)
- `source`: `'cancellation_credit_more_than_24h' | 'cancellation_credit_less_than_24h' | 'professional_cancellation' | 'admin_compensation'`
- `isRedeemed`: boolean
