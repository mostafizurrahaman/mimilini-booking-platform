# Booking API Testing Scenarios & Status Verification Guide

This guide provides end-to-end testing flows for all **10 booking statuses** and business scenarios defined in Mimilini.

---

## Quick Reference: The 10 Core Statuses

| Status | Trigger Endpoint / Action | Next Possible States |
| :--- | :--- | :--- |
| `requested` | `POST /api/v1/booking` (Standard / Non-Quick Booking) | `accepted`, `declined`, `cancelled` |
| `accepted` | `PATCH /api/v1/booking/:id/accept` | `confirmed`, `cancelled` |
| `confirmed` | `POST /api/v1/booking/:id/confirm-payment` OR Quick Booking | `in_progress`, `completed`, `rescheduled`, `cancelled`, `no_show_pending` |
| `in_progress` | Artist starts service / updates progress | `completed`, `no_show_pending`, `cancelled` |
| `completed` | `POST /api/v1/booking/:id/complete` (Photos + signature) | Terminal state |
| `cancelled` | `POST /api/v1/booking/:id/cancel` OR 2h cron expiry | Terminal state |
| `declined` | `PATCH /api/v1/booking/:id/decline` | Terminal state |
| `rescheduled` | `POST /api/v1/booking/:id/reschedule-respond` (`accept`) | `in_progress`, `completed`, `cancelled` |
| `no_show_pending` | `POST /api/v1/booking/:id/report-no-show` | `no_show` (Admin approves) OR `confirmed` (Admin rejects) |
| `no_show` | `POST /api/v1/booking/:id/verify-no-show` (`isApproved: true`) | Terminal state |

---

## Common Setup Prerequisites

Set environment variables in your Postman or API client:
- `baseUrl`: `http://localhost:5000`
- `customerToken`: Bearer JWT token of Customer (`role: "customer"`)
- `artistToken`: Bearer JWT token of Artist (`role: "artist"`)
- `adminToken`: Bearer JWT token of Admin (`role: "admin"`)
- `paymentMethodId`: Valid Stripe card ID (e.g., `pm_card_visa`) saved for Customer

---

## Scenario 1: Standard Happy Path (`requested` $\rightarrow$ `accepted` $\rightarrow$ `confirmed` $\rightarrow$ `completed`)

### Step 1.1: Customer previews checkout
- **Method:** `POST`
- **URL:** `{{baseUrl}}/api/v1/booking/preview`
- **Headers:** `Authorization: Bearer {{customerToken}}`
- **Body:**
```json
{
  "artist": "67b000000000000000000001",
  "service": "67b000000000000000000002",
  "bookingDate": "2026-11-15",
  "startTime": "10:00",
  "visitType": "salon_visit",
  "usePlatformCredit": false
}
```
- **Expected Status:** `200 OK`
- **Expected Output:** Financial breakdown containing `servicePrice`, `depositAmount` (20%), `balanceAmount` (80%), `platformCommissionAmount`, `artistNetPayout`.

### Step 1.2: Customer creates booking request
- **Method:** `POST`
- **URL:** `{{baseUrl}}/api/v1/booking`
- **Headers:** `Authorization: Bearer {{customerToken}}`
- **Body:**
```json
{
  "artist": "67b000000000000000000001",
  "service": "67b000000000000000000002",
  "bookingDate": "2026-11-15",
  "startTime": "10:00",
  "visitType": "salon_visit"
}
```
- **Expected Status:** `201 Created`
- **Database Verification:**
  - `booking.status`: `"requested"`
  - `booking.initialPayment.status`: `"pending"`
  - `booking.balancePayment.status`: `"pending"`

### Step 1.3: Artist accepts booking
- **Method:** `PATCH`
- **URL:** `{{baseUrl}}/api/v1/booking/{{bookingId}}/accept`
- **Headers:** `Authorization: Bearer {{artistToken}}`
- **Expected Status:** `200 OK`
- **Database Verification:**
  - `booking.status`: `"accepted"`

### Step 1.4: Customer pays 20% deposit to confirm
- **Method:** `POST`
- **URL:** `{{baseUrl}}/api/v1/booking/{{bookingId}}/confirm-payment`
- **Headers:** `Authorization: Bearer {{customerToken}}`
- **Body:**
```json
{
  "paymentMethodId": "{{paymentMethodId}}",
  "usePlatformCredit": false
}
```
- **Expected Status:** `200 OK`
- **Database Verification:**
  - `booking.status`: `"confirmed"`
  - `booking.initialPayment.status`: `"captured"`
  - `booking.initialPayment.paidAt`: Non-null date
  - `booking.stripeInvoiceId`: Master Customer Tax Invoice created in Stripe

### Step 1.5: 24h prior auto-charge for remaining 80% balance
*(Triggered automatically by cron job or manually paid early by customer)*
- **Method (Manual Test):** `POST`
- **URL:** `{{baseUrl}}/api/v1/booking/{{bookingId}}/pay-balance`
- **Headers:** `Authorization: Bearer {{customerToken}}`
- **Body:**
```json
{
  "paymentMethodId": "{{paymentMethodId}}"
}
```
- **Expected Status:** `200 OK`
- **Database Verification:**
  - `booking.status`: `"confirmed"`
  - `booking.balancePayment.status`: `"captured"`
  - `booking.balancePayment.paidAt`: Non-null date
  - RCTI Invoice issued to Artist

### Step 1.6: Artist completes service
- **Method:** `POST` (Form-data)
- **URL:** `{{baseUrl}}/api/v1/booking/{{bookingId}}/complete`
- **Headers:** `Authorization: Bearer {{artistToken}}`
- **Form Data:**
  - `data`: `{"servicesPerformed":"Hair Styling","productsUsed":"Organic Serum","totalWorkingTime":"60 mins","specialNotes":"Customer was delighted"}`
  - `proofPhotos`: [Select 1-2 test images]
- **Expected Status:** `200 OK`
- **Database Verification:**
  - `booking.status`: `"completed"`
  - `booking.completionDetails.proofPhotos`: Array of S3 image URLs
  - `booking.completionDetails.completedAt`: Non-null date

---

## Scenario 2: Quick Booking Path (Instant `confirmed`)

### Step 2.1: Customer books an artist with Quick Booking enabled
- **Method:** `POST`
- **URL:** `{{baseUrl}}/api/v1/booking`
- **Headers:** `Authorization: Bearer {{customerToken}}`
- **Body:**
```json
{
  "artist": "67b000000000000000000001",
  "service": "67b000000000000000000002",
  "bookingDate": "2026-11-20",
  "startTime": "14:00",
  "visitType": "salon_visit",
  "paymentMethodId": "{{paymentMethodId}}"
}
```
- **Expected Status:** `201 Created`
- **Expected Output:** Immediate 20% capture without waiting for manual acceptance.
- **Database Verification:**
  - `booking.status`: `"confirmed"`
  - `booking.isQuickBooking`: `true`
  - `booking.initialPayment.status`: `"captured"`

---

## Scenario 3: Artist Declines Request (`requested` $\rightarrow$ `declined`)

### Step 3.1: Artist declines booking request
- **Method:** `PATCH`
- **URL:** `{{baseUrl}}/api/v1/booking/{{bookingId}}/decline`
- **Headers:** `Authorization: Bearer {{artistToken}}`
- **Body:**
```json
{
  "reason": "Not available during this specific slot"
}
```
- **Expected Status:** `200 OK`
- **Database Verification:**
  - `booking.status`: `"declined"`
  - `booking.cancelledByRole`: `"artist"`
  - `booking.cancellationReason`: `"Not available during this specific slot"`

---

## Scenario 4: Rescheduling Flow (`confirmed` $\rightarrow$ `rescheduled`)

### Step 4.1: Customer or Artist requests reschedule
- **Method:** `POST`
- **URL:** `{{baseUrl}}/api/v1/booking/{{bookingId}}/reschedule-request`
- **Headers:** `Authorization: Bearer {{customerToken}}`
- **Body:**
```json
{
  "newDate": "2026-11-22",
  "newStartTime": "15:00",
  "reason": "Family emergency, need to push 2 days"
}
```
- **Expected Status:** `200 OK`
- **Database Verification:**
  - `booking.rescheduleHistory`: Contains new entry with `status: "pending"`

### Step 4.2: Other party accepts reschedule
- **Method:** `POST`
- **URL:** `{{baseUrl}}/api/v1/booking/{{bookingId}}/reschedule-respond`
- **Headers:** `Authorization: Bearer {{artistToken}}`
- **Body:**
```json
{
  "action": "accept"
}
```
- **Expected Status:** `200 OK`
- **Database Verification:**
  - `booking.status`: `"rescheduled"`
  - `booking.bookingDate`: `"2026-11-22T00:00:00.000Z"`
  - `booking.startTime`: `"15:00"`

---

## Scenario 5: Customer Cancellation >24 Hours (`status: cancelled`)

*Policy: 20% Deposit refunded to customer wallet as Platform Credit, minus Stripe processing fee.*

### Step 5.1: Customer cancels more than 24 hours before appointment
- **Method:** `POST`
- **URL:** `{{baseUrl}}/api/v1/booking/{{bookingId}}/cancel`
- **Headers:** `Authorization: Bearer {{customerToken}}`
- **Body:**
```json
{
  "cancellationReason": "Change of plans"
}
```
- **Expected Status:** `200 OK`
- **Expected Response Message:** Mentions 20% deposit minus Stripe fee credited to wallet as Platform Credit.
- **Database Verification:**
  - `booking.status`: `"cancelled"`
  - `booking.cancelledByRole`: `"customer"`
  - `booking.platformCreditIssued`: Equal to `initialPayment.amount - stripeInitialFee`
  - `booking.initialPayment.status`: `"refunded"`
  - `Wallet`: Customer wallet balance increased by `platformCreditIssued`
  - `WalletLedger`: Entry with `source: "cancellation_credit"`

---

## Scenario 6: Customer Cancellation <24 Hours with 80% Paid (`status: cancelled`)

*Policy: Platform keeps 20% deposit. Customer gets 40% of artist net payout as Platform Credit. Artist gets 40% of artist net payout transferred to Connected Account.*

### Step 6.1: Customer cancels within 24 hours (after 80% was charged)
- **Method:** `POST`
- **URL:** `{{baseUrl}}/api/v1/booking/{{bookingId}}/cancel`
- **Headers:** `Authorization: Bearer {{customerToken}}`
- **Body:**
```json
{
  "cancellationReason": "Cannot make it today"
}
```
- **Expected Status:** `200 OK`
- **Database Verification:**
  - `booking.status`: `"cancelled"`
  - `booking.cancelledByRole`: `"customer"`
  - `booking.platformCreditIssued`: Equal to `round2(artistNetPayout * 0.4)`
  - `Wallet`: Customer wallet balance credited with 40% share
  - `PaymentTransaction`: Type `CANCELLATION_FEE` recorded with `artistNetShare: round2(artistNetPayout * 0.4)`
  - Stripe Transfer created to Artist Connected Account

---

## Scenario 7: Customer Cancellation <24 Hours WITHOUT 80% Paid (`status: cancelled`)

*Policy: 20% deposit forfeited by customer to platform.*

### Step 7.1: Customer cancels within 24 hours (80% was pending/unpaid)
- **Method:** `POST`
- **URL:** `{{baseUrl}}/api/v1/booking/{{bookingId}}/cancel`
- **Headers:** `Authorization: Bearer {{customerToken}}`
- **Body:**
```json
{
  "cancellationReason": "Last minute cancellation"
}
```
- **Expected Status:** `200 OK`
- **Database Verification:**
  - `booking.status`: `"cancelled"`
  - `booking.cancelledByRole`: `"customer"`
  - `booking.depositForfeited`: `true`
  - `booking.platformCreditIssued`: `0`

---

## Scenario 8: 24h Balance Non-Payment $\rightarrow$ 2h Rectification Expiry $\rightarrow$ Auto-Cancellation

*Policy: Auto-charge fails 24h prior. Customer gets 2h grace period. If not rectified, cron cancels booking, refunds 20% deposit minus Stripe fee to wallet, and frees artist slot.*

### Step 8.1: Background cron encounters declined card
- Cron job marks:
  - `booking.balancePayment.status`: `"failed"`
  - `booking.balancePayment.rectificationDeadline`: Now + 2 hours
  - `PaymentTransaction`: `FAILED` record created

### Step 8.2: 2-hour window expires without payment
- Cron job `processExpiredRectificationCancellations` triggers:
- **Database Verification:**
  - `booking.status`: `"cancelled"`
  - `booking.cancelledByRole`: `"system"`
  - `booking.cancellationReason`: `"Non-payment of remaining 80% balance within 2-hour rectification window"`
  - `booking.platformCreditIssued`: `initialPayment.amount - stripeInitialFee`
  - `booking.initialPayment.status`: `"refunded"`
  - Customer Wallet credited

---

## Scenario 9: Artist Cancellation <48h (`status: cancelled`, Artist SUSPENDED)

*Policy: Customer receives 100% refund as Platform Credit + list of nearby alternative artists. Artist account is SUSPENDED (Hard-Block).*

### Step 9.1: Artist cancels less than 48 hours before booking
- **Method:** `POST`
- **URL:** `{{baseUrl}}/api/v1/booking/{{bookingId}}/cancel`
- **Headers:** `Authorization: Bearer {{artistToken}}`
- **Body:**
```json
{
  "cancellationReason": "Equipment malfunction"
}
```
- **Expected Status:** `200 OK`
- **Expected Response Body:**
  - `message`: Warns artist that account is **SUSPENDED** due to <48h cancellation.
  - `nearbyAlternativeArtists`: Array of up to 6 alternative artists.
- **Database Verification:**
  - `booking.status`: `"cancelled"`
  - `booking.cancelledByRole`: `"artist"`
  - `booking.platformCreditIssued`: 100% of all paid money
  - `User.authStatus`: `"suspended"` (Artist blocked from all endpoints except `/penalty` and `/auth/me`)
  - `ArtistProfile.isSearchVisible`: `false`
  - `ArtistProfile.activePenaltyAmount`: Penalty amount incurred
  - `PaymentTransaction`: Type `PENALTY` created

### Step 9.2: Verify Artist cannot access other endpoints while suspended
- **Method:** `GET`
- **URL:** `{{baseUrl}}/api/v1/booking/my-bookings`
- **Headers:** `Authorization: Bearer {{artistToken}}`
- **Expected Status:** `403 Forbidden`
- **Expected Message:** `"Your account is suspended due to unpaid cancellation penalties. Please visit the penalty payment portal..."`

### Step 9.3: Artist pays penalty to reactivate account
- **Method:** `POST`
- **URL:** `{{baseUrl}}/api/v1/penalty/create-checkout-session`
- **Headers:** `Authorization: Bearer {{artistToken}}`
- **Expected Status:** `200 OK`
- **Expected Output:** Returns Stripe checkout session URL. Once paid, webhook restores `authStatus: "active"`.

---

## Scenario 10: Artist Cancellation >48h (`status: cancelled`, Soft-Block)

*Policy: Customer receives 100% Platform Credit. Artist gets penalty notice and profile is hidden from search until paid (`authStatus` remains active).*

### Step 10.1: Artist cancels >48h in advance
- **Method:** `POST`
- **URL:** `{{baseUrl}}/api/v1/booking/{{bookingId}}/cancel`
- **Headers:** `Authorization: Bearer {{artistToken}}`
- **Body:**
```json
{
  "cancellationReason": "Scheduling conflict"
}
```
- **Expected Status:** `200 OK`
- **Database Verification:**
  - `booking.status`: `"cancelled"`
  - `User.authStatus`: `"active"` (Artist is NOT suspended)
  - `ArtistProfile.isSearchVisible`: `false` (Hidden from public search until penalty is paid)
  - `ArtistProfile.activePenaltyAmount`: Tiered penalty amount

---

## Scenario 11: Customer No-Show & Safety Refusal (`no_show_pending` $\rightarrow$ `no_show`)

*Policy: Artist reports no-show. Status becomes `no_show_pending`. Admin verifies claim. Upon approval, status becomes `no_show` and 100% protected net payout is transferred to Artist Stripe Connected Account.*

### Step 11.1: Artist reports customer no-show
- **Method:** `POST`
- **URL:** `{{baseUrl}}/api/v1/booking/{{bookingId}}/report-no-show`
- **Headers:** `Authorization: Bearer {{artistToken}}`
- **Body:**
```json
{
  "reason": "Customer did not answer door or phone after 20 minutes wait",
  "isSafetyConcern": false
}
```
- **Expected Status:** `200 OK`
- **Database Verification:**
  - `booking.status`: `"no_show_pending"`
  - `booking.noShowDetails.reportedBy`: Artist ID
  - `booking.noShowDetails.isApproved`: `false`
  - Balance 80% auto-charged if previously pending

### Step 11.2: Admin approves no-show claim
- **Method:** `POST`
- **URL:** `{{baseUrl}}/api/v1/booking/{{bookingId}}/verify-no-show`
- **Headers:** `Authorization: Bearer {{adminToken}}`
- **Body:**
```json
{
  "isApproved": true,
  "adminNotes": "Verified GPS logs and call records"
}
```
- **Expected Status:** `200 OK`
- **Database Verification:**
  - `booking.status`: `"no_show"`
  - `booking.noShowDetails.isApproved`: `true`
  - `booking.noShowDetails.verifiedBy`: Admin ID
  - Stripe Transfer created sending 100% protected net payout to Artist Connected Account
  - `PaymentTransaction`: Type `FULL_100` created with `artistNetShare: booking.artistNetPayout`

### Step 11.3 (Alternative): Admin rejects no-show claim
- **Body:** `{"isApproved": false, "adminNotes": "Customer arrived within acceptable grace period"}`
- **Database Verification:**
  - `booking.status`: Reverted to `"confirmed"`

---

## Scenario 12: Querying & Filtering Bookings by Status

Verify the `GET /api/v1/booking/my-bookings` tab and status filters:

| Tab Parameter | Statuses Returned |
| :--- | :--- |
| `?tab=upcoming` | `confirmed`, `in_progress`, `rescheduled` |
| `?tab=pending` | `requested`, `accepted` |
| `?tab=new_requests` | `requested` |
| `?tab=completed` | `completed` |
| `?tab=cancelled` | `cancelled`, `declined`, `no_show` |
| `?status=no_show_pending` | Specific status query |
