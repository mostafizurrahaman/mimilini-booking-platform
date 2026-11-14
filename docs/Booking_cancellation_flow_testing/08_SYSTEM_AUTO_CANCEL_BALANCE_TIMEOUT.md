# Flow 08: System Auto-Cancellation — 2-Hour Balance Rectification Timeout (Cron)

> **Policy Rule:** At **24 hours prior to appointment**, the system attempts to auto-charge the remaining **80% balance**.
> - If the auto-charge fails (or no card is found), `balancePayment.status` becomes `"failed"` and a **2-hour rectification deadline** is opened (`balancePayment.rectificationDeadline = now + 2 hours`).
> - If the customer does NOT manually rectify/pay the balance via `POST /bookings/:id/pay-balance` within 2 hours:
>   - `processExpiredRectificationCancellations` cron (runs every 2 minutes) automatically cancels the booking (`status: "cancelled"`, `cancelledByRole: "system"`).
>   - Customer receives Platform Credit for their `20% deposit - Stripe initial fee`.
>   - Any original Platform Credit used at booking is restored (`BOOKING_ROLLBACK`).
>   - Slot is released.

---

## 🔄 API & Verification Serial

### Step 1: Create & Confirm Booking
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
  "bookingDate": "2026-12-29",
  "startTime": "16:00",
  "guestCount": 1,
  "isQuickBooking": true,
  "usePlatformCredit": false,
  "paymentMethodId": "{{paymentMethodId}}"
}
```
- **Check:**
  - `data.booking.status`: `"confirmed"`
  - `data.booking.initialPayment.status`: `"captured"`
  - `data.booking.balancePayment.status`: `"pending"`

---

### Step 2: Simulate Failed 24h Balance Auto-Charge & Expired 2h Rectification
*In MongoDB, simulate that the 24h charge failed and the 2-hour rectification window has just expired:*
```javascript
db.bookings.updateOne(
  { _id: ObjectId("{{bookingId}}") },
  {
    $set: {
      "balancePayment.status": "failed",
      "balancePayment.failedAt": new Date(Date.now() - 2.5 * 60 * 60 * 1000),
      "balancePayment.rectificationDeadline": new Date(Date.now() - 5 * 60 * 1000)
    }
  }
)
```
Then wait up to **2 minutes** (or restart server to run immediately on boot) for `processExpiredRectificationCancellations` cron to execute.

Look for server console log:
`[Cron: Policy Enforced] Booking #... cancelled due to non-payment. 20% deposit ($...) minus Stripe processing fee ($...) credited to wallet as $.... Slot released.`

---

### Step 3: Verify Booking Status & Wallet Refund Credit
1. **Check Booking Details (`GET {{baseUrl}}/bookings/{{bookingId}}`):**
   - `data.status`: `"cancelled"`
   - `data.cancelledByRole`: `"system"`
   - `data.cancellationReason`: `"Non-payment of remaining 80% balance within 2-hour rectification window"`
   - `data.initialPayment.status`: `"refunded"`
   - `data.platformCreditIssued`: equals `round2(initialPayment.amount - stripeInitialFee)`

2. **Check Customer Wallet (`GET {{baseUrl}}/wallets/my-wallet`):**
   - Balance increased by `platformCreditIssued`.
   - Wallet Ledger (`GET {{baseUrl}}/wallets/ledger`): Contains entry with `source: "cancellation_credit"`.

3. **Verify Slot Released:**
   - Booking `2026-12-29` at `16:00` succeeds for new requests without conflict.

---

### Step 4 *(Alternative Positive Control Test)*: Customer Pays Within 2 Hours
To verify recovery **before** expiry:
1. Set `"balancePayment.status": "failed"` and `"balancePayment.rectificationDeadline": new Date(Date.now() + 60 * 60 * 1000)` (still 1 hour remaining).
2. Call `POST {{baseUrl}}/bookings/{{bookingId}}/pay-balance` with valid `paymentMethodId`.
3. **Check:** Returns `200 OK`, `balancePayment.status` changes to `"captured"`, and booking stays `"confirmed"`.

