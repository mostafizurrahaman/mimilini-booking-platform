# Flow 02: Customer Early Cancellation (>24 Hours Before Appointment)

> **Policy Rule:** If a customer cancels a `CONFIRMED` booking **more than 24 hours** before the scheduled appointment time:
> - Total paid (`20% deposit` or `20% deposit + 80% balance`) minus **Stripe processing fees** is credited back to the customer's **Platform Wallet** (valid for 36 months).
> - Any originally used Platform Credit is restored (`BOOKING_ROLLBACK`).
> - Applied promo code usage count is decremented.
> - Stripe Invoice is voided or a Credit Note is issued.
> - Artist's schedule slot is released with **zero penalty** to the artist.

---

## 🔄 API Execution Serial

### Step 1: Check Customer Wallet Balance Beforehand *(Baseline)*
- **Method:** `GET`
- **URL:** `{{baseUrl}}/wallets/my-wallet`
- **Auth:** `Bearer {{customerToken}}`
- **What to Check:** Note the initial `balance` (e.g., `$0`).

---

### Step 2: Create & Confirm Booking (>24 Hours in Future)
*Pick a `bookingDate` at least 2–3 days ahead (e.g., `2026-12-25`).*

#### Option A: Via Quick Booking (`isQuickBooking: true` when artist enabled it)
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
  "bookingDate": "2026-12-25",
  "startTime": "14:00",
  "guestCount": 1,
  "isQuickBooking": true,
  "usePlatformCredit": false,
  "paymentMethodId": "{{paymentMethodId}}"
}
```
#### Option B: Via Standard Flow
1. `POST {{baseUrl}}/bookings` (`isQuickBooking: false`) $\rightarrow$ `requested`
2. `PATCH {{baseUrl}}/bookings/{{bookingId}}/accept` (Artist Auth) $\rightarrow$ `accepted`
3. `POST {{baseUrl}}/bookings/{{bookingId}}/confirm-payment` (Customer Auth, body: `{"paymentMethodId": "{{paymentMethodId}}"}`) $\rightarrow$ `confirmed`

- **What to Check:**
  - `data.booking.status`: `"confirmed"`
  - `data.booking.initialPayment.status`: `"captured"`
  - Note `initialPayment.amount` (e.g., `$20`) and `stripeInitialFee` (e.g., `$0.65`).

---

### Step 3 *(Optional — Test 100% Paid Case)*: Pay Remaining 80% Balance
*Run this step if you want to verify full 100% payment refund credit; skip to test 20%-deposit-only.*
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
  - Note `balancePayment.amount` and `stripeBalanceFee`.

---

### Step 4: Customer Cancels (>24h Prior)
- **Method:** `POST`
- **URL:** `{{baseUrl}}/bookings/{{bookingId}}/customer-cancel`
- **Auth:** `Bearer {{customerToken}}`
- **Body:**
```json
{
  "cancellationReason": "Plans changed 3 days before appointment"
}
```
- **What to Check:**
  - Status Code: `200 OK`
  - `data.booking.status`: `"cancelled"`
  - `data.booking.cancelledByRole`: `"customer"`
  - `data.booking.initialPayment.status`: `"refunded"`
  - `data.booking.balancePayment.status`: `"refunded"` (if balance was paid)
  - `data.booking.platformCreditIssued`: equals `(depositPaid + balancePaid) - (stripeInitialFee + stripeBalanceFee)`
  - `data.booking.depositForfeited`: `false`

---

### Step 5: Verify Wallet Credit, Ledger & Timeline
1. **Verify Wallet Balance:**
   - **Method:** `GET`
   - **URL:** `{{baseUrl}}/wallets/my-wallet`
   - **Auth:** `Bearer {{customerToken}}`
   - **Check:** Balance increased by exact `platformCreditIssued`.
2. **Verify Wallet Ledger Entry:**
   - **Method:** `GET`
   - **URL:** `{{baseUrl}}/wallets/ledger`
   - **Auth:** `Bearer {{customerToken}}`
   - **Check:** New entry with `source: "cancellation_credit"` and description showing `>24h policy`.
3. **Verify Timeline:**
   - **Method:** `GET`
   - **URL:** `{{baseUrl}}/bookings/{{bookingId}}/timeline`
   - **Auth:** `Bearer {{customerToken}}`
   - **Check:** Milestone `"cancelled"` recorded.
4. **Verify Stripe Invoice Voided/Credit Note:**
   - Verify in Stripe Dashboard (or booking object) that invoice was voided/credited.
5. **Verify Artist Penalty:**
   - **Method:** `GET`
   - **URL:** `{{baseUrl}}/penalties/my-penalties`
   - **Auth:** `Bearer {{artistToken}}`
   - **Check:** NO penalty created for the professional.

