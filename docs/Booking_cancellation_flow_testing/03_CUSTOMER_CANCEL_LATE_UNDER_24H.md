# Flow 03: Customer Late Cancellation (<24 Hours Before Appointment)

> **Policy Rule:** If a customer cancels a `CONFIRMED` booking **within 24 hours** before the appointment:
> - **Sub-Case A (Only 20% Deposit Paid):** The 20% deposit is **non-refundable and forfeited** (`depositForfeited: true`, `platformCreditIssued: 0`).
> - **Sub-Case B (100% Paid — Deposit + 80% Balance Paid):**
>   - Platform retains the 20% deposit (`depositForfeited: true`).
>   - Customer receives **50% of `artistNetPayout`** as Platform Credit to Wallet.
>   - Professional receives **50% of `artistNetPayout`** via Stripe Connect transfer (`PaymentTransaction` created).

> **Setup Prerequisite:** Ensure the professional's schedule `minNotice` is `0` (or lower than your test appointment offset) so you can create an appointment 6–12 hours from the current time.

---

## 🔄 API Execution Serial

### Step 1: Create & Confirm Booking Within Next 24 Hours
*Set `bookingDate` to today or tomorrow and `startTime` to **6–12 hours from current server time**.*

- **Method:** `POST`
- **URL:** `{{baseUrl}}/bookings`
- **Auth:** `Bearer {{customerToken}}`
- **Body:**
```json
{
  "artist": "{{artistId}}",
  "services": ["{{serviceId}}"],
  "visitType": "home_visit",
  "address": "{{addressId}}",
  "bookingDate": "2026-11-10",
  "startTime": "20:00",
  "guestCount": 1,
  "isQuickBooking": true,
  "usePlatformCredit": false,
  "paymentMethodId": "{{paymentMethodId}}"
}
```
*(Or confirm via `PATCH /accept` + `POST /confirm-payment` if using standard request).*
- **What to Check:**
  - `data.booking.status`: `"confirmed"`
  - Note `data.booking.initialPayment.amount` (20%) and `data.booking.artistNetPayout`.

---

### Step 2 *(For Sub-Case B Only)*: Pay Remaining 80% Balance
*Skip this step to test Sub-Case A (20% Deposit Forfeiture). Run this step to test Sub-Case B (50/50 split of Artist Net Payout).*
- **Method:** `POST`
- **URL:** `{{baseUrl}}/bookings/{{bookingId}}/pay-balance`
- **Auth:** `Bearer {{customerToken}}`
- **Body:**
```json
{
  "paymentMethodId": "{{paymentMethodId}}"
}
```
- **What to Check:**
  - `data.balancePayment.status`: `"captured"`

---

### Step 3: Customer Cancels (<24h Prior)
- **Method:** `POST`
- **URL:** `{{baseUrl}}/bookings/{{bookingId}}/customer-cancel`
- **Auth:** `Bearer {{customerToken}}`
- **Body:**
```json
{
  "cancellationReason": "Emergency came up 5 hours before appointment"
}
```

#### What to Check for Sub-Case A (Only 20% Deposit Paid):
- Status Code: `200 OK`
- `message`: `"Booking cancelled under Late Cancellation policy (<24h). The 20% deposit is non-refundable and forfeited."`
- `data.booking.status`: `"cancelled"`
- `data.booking.depositForfeited`: `true`
- `data.booking.cancellationFeeCharged`: equals `initialPayment.amount`
- `data.booking.platformCreditIssued`: `0`

#### What to Check for Sub-Case B (100% Paid — Deposit + 80% Balance):
- Status Code: `200 OK`
- `message`: contains `"Platform retained the 20% deposit. You received $... Platform Credit (50% of professional net payout)."`
- `data.booking.status`: `"cancelled"`
- `data.booking.depositForfeited`: `true`
- `data.booking.platformCreditIssued`: equals `round2(artistNetPayout * 0.5)`
- `data.booking.balancePayment.status`: `"refunded"`
- `data.booking.cancellationFeeCharged`: equals `initialPayment.amount + artistShareAmount`

---

### Step 4: Verify Wallet, Payout Transaction & Notifications
1. **Customer Wallet Balance (`GET {{baseUrl}}/wallets/my-wallet`):**
   - **Sub-Case A:** No credit added (`$0` change).
   - **Sub-Case B:** Increased by `50% of artistNetPayout`. Ledger source: `"cancellation_credit"`.
2. **Artist Compensation (`GET {{baseUrl}}/transactions` with Admin/Artist token):**
   - **Sub-Case B:** Check `PaymentTransaction` record with `transactionId: "TXN-{{bookingNumber}}-LATE-CANCEL"`, `type: "cancellation_fee"`, and `artistNetShare` = `50% of artistNetPayout`.
3. **Notification (`GET {{baseUrl}}/notifications` with Artist token):**
   - Professional receives `"Booking Cancelled by Customer"` mentioning `<24h cancellation`.
4. **Timeline (`GET {{baseUrl}}/bookings/{{bookingId}}/timeline`):**
   - Milestone `"cancelled"` recorded.

