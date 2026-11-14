# Flow 05: Professional Cancels Booking (Penalty, Discovery Hide & <48h Suspension)

> **Policy Rules:**
> - **Pre-payment (`accepted` / `requested`, unpaid):** Professional can cancel with **no penalty** and **no refund**; customer is notified.
> - **Confirmed (>48 Hours Before Appointment):**
>   - Customer receives **Platform Credit** = `totalPaid - stripeTransactionFees` (valid 36 months).
>   - Professional receives a **Cancellation Penalty** (`PENALTY_STATUS.PENDING`).
>   - Professional's `ArtistProfile.isPenaltyRequired` becomes `true` (profile hidden from customer search & blocked from new bookings until penalty is paid).
>   - Alternative nearby artists are returned in the response for the customer.
> - **Confirmed ($\le$ 48 Hours Before Appointment / Last-Minute):**
>   - Everything above applies, **PLUS** Professional's `User.status` becomes **`SUSPENDED`** until penalty is resolved!

> ⚠️ **Testing Warning:** Testing the **<48h** flow will **SUSPEND** your test professional user (`status: "suspended"`). After testing <48h, reactivate via Penalty Payment (`POST /penalties/:id/pay`) or Admin DB update before continuing other artist tests.

---

## 🔄 API Execution Serial

### Step 1: Create & Confirm Booking
- **Sub-Case A (>48h test):** Pick `bookingDate` 4–5 days ahead (e.g., `2026-12-28`).
- **Sub-Case B ($\le$48h suspension test):** Pick `bookingDate` tomorrow or within 24–36 hours.

- **Method:** `POST`
- **URL:** `{{baseUrl}}/bookings`
- **Auth:** `Bearer {{customerToken}}`
- **Body:**
```json
{
  "artist": "{{artistId}}",
  "services": ["{{serviceId}}"],
  "visitType": "salon_visit",
  "bookingDate": "2026-12-28",
  "startTime": "15:00",
  "guestCount": 1,
  "isQuickBooking": true,
  "usePlatformCredit": false,
  "paymentMethodId": "{{paymentMethodId}}"
}
```
- **What to Check:**
  - `data.booking.status`: `"confirmed"`
  - `data.booking.initialPayment.status`: `"captured"`

---

### Step 2: Professional Cancels the Confirmed Booking
- **Method:** `POST`
- **URL:** `{{baseUrl}}/bookings/{{bookingId}}/artist-cancel` *(or `POST /bookings/{{bookingId}}/cancel` with `artistToken`)*
- **Auth:** `Bearer {{artistToken}}`
- **Body:**
```json
{
  "cancellationReason": "Unexpected family emergency"
}
```

#### What to Check (Sub-Case A: >48 Hours Prior):
- Status Code: `200 OK`
- `message`: contains `"A penalty of $... AUD was issued and your profile is hidden from customer search until paid."`
- `data.booking.status`: `"cancelled"`
- `data.booking.cancelledByRole`: `"artist"`
- `data.booking.initialPayment.status`: `"refunded"`
- `data.booking.platformCreditIssued`: equals `totalPaid - totalTransactionFee`
- `data.nearbyAlternativeArtists`: Array of alternative active services (excluding this artist).

#### What to Check (Sub-Case B: $\le$48 Hours Prior):
- Status Code: `200 OK`
- `message`: contains `"Your account has been SUSPENDED due to last-moment cancellation (<48h)."`
- Everything from Sub-Case A applies.

---

### Step 3: Verify Penalties, Discovery Block & Suspension
1. **Check Professional Penalties:**
   - **Method:** `GET`
   - **URL:** `{{baseUrl}}/penalties/my-penalties`
   - **Auth:** `Bearer {{artistToken}}` *(Note: if suspended, check via Admin `GET /penalties`)*
   - **Check:** New `Penalty` document created with `status: "pending"`, `penaltyAmount > 0`.
2. **Check Customer Wallet (`GET {{baseUrl}}/wallets/my-wallet` with Customer Token):**
   - **Check:** Balance credited with `totalPaid - totalTransactionFee`, Ledger source `"cancellation_credit"`.
3. **Check Discovery & New Booking Block:**
   - Try creating a new booking for `{{artistId}}` (`POST /bookings`).
   - **Check:** Returns `403 Forbidden` (`"This professional is currently unavailable for new bookings."`) if `isPenaltyRequired: true`, or fails if suspended.
4. **Check Customer Notification (`GET {{baseUrl}}/notifications` with Customer Token):**
   - **Check:** Notification `"Booking Cancelled by Professional"` received.

---

### Step 4 *(Cleanup / Recovery)*: Resolve Artist Penalty
If you want to restore the test professional account after testing:
1. Call `POST {{baseUrl}}/penalties/{{penaltyId}}/waive` using `{{adminToken}}` *(or pay via `/penalties/{{penaltyId}}/pay`)*.
2. If Sub-Case B suspended the artist, ensure `User.status` is restored to `"active"` in DB/Admin.

