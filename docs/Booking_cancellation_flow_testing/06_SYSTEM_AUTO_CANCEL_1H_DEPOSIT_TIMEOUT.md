# Flow 06: System Auto-Cancellation — 1-Hour Deposit Timeout (Cron)

> **Policy Rule:** Once a professional **accepts** a booking request (`status: accepted`), a **1-hour payment window** starts (`initialPayment.dueDate = now + 1 hour`).
> - If the customer does NOT pay the 20% deposit within 1 hour:
>   - The background cron (`processExpiredInitialPaymentBookings`, running every 2 minutes) automatically cancels the booking (`status: cancelled`, `cancelledByRole: "system"`).
>   - Any reserved platform credit is rolled back to the customer's wallet.
>   - Both customer and professional receive notifications.
>   - The professional's time slot is freed immediately.

---

## 🔄 API & Verification Serial

### Step 1: Customer Creates Standard Booking Request
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
  "bookingDate": "2026-12-26",
  "startTime": "10:00",
  "guestCount": 1,
  "isQuickBooking": false,
  "usePlatformCredit": false,
  "paymentMethodId": "{{paymentMethodId}}"
}
```
- **What to Check:**
  - Status Code: `201 Created`
  - `data.booking.status`: `"requested"`
  - Save `data.booking._id` as `{{bookingId}}`.

---

### Step 2: Professional Accepts Booking (Starts 1-Hour Timer)
- **Method:** `PATCH`
- **URL:** `{{baseUrl}}/bookings/{{bookingId}}/accept`
- **Auth:** `Bearer {{artistToken}}`
- **What to Check:**
  - Status Code: `200 OK`
  - `data.status`: `"accepted"`
  - `data.initialPayment.dueDate`: Set to **exactly 1 hour** after the accept timestamp.
  - Check Customer Notification (`GET {{baseUrl}}/notifications`): Message tells customer *"Please complete the 20% deposit payment within 1 hour to secure your appointment."*

---

### Step 3: Trigger / Simulate 1-Hour Expiry
*Do **NOT** call `confirm-payment`. Choose either option:*

- **Option A (Fast QA Testing via MongoDB — takes 2 mins):**
  Update `initialPayment.dueDate` in MongoDB to a past timestamp (e.g., 5 minutes ago):
  ```javascript
  db.bookings.updateOne(
    { _id: ObjectId("{{bookingId}}") },
    { $set: { "initialPayment.dueDate": new Date(Date.now() - 5 * 60 * 1000) } }
  )
  ```
  Then wait up to **2 minutes** (or restart server to run immediately on boot) for `processExpiredInitialPaymentBookings` cron to execute.
  Look for server console log:
  `[Cron: Initial Payment Expiry] Booking #... auto-cancelled due to 1-hour payment timeout. Slot released.`

- **Option B (Real-Time Test):**
  Leave the booking untouched for 62 minutes and observe the cron log.

---

### Step 4: Verify Booking Status, Timeline & Notifications
1. **Check Booking Details:**
   - **Method:** `GET`
   - **URL:** `{{baseUrl}}/bookings/{{bookingId}}`
   - **Auth:** `Bearer {{customerToken}}`
   - **Check:**
     - `data.status`: `"cancelled"`
     - `data.cancelledByRole`: `"system"`
     - `data.cancellationReason`: `"Auto-cancelled: Customer did not complete initial deposit payment within 1 hour"`
     - `data.cancellationFeeCharged`: `0`
     - `data.depositForfeited`: `false`

2. **Check Timeline:**
   - **Method:** `GET`
   - **URL:** `{{baseUrl}}/bookings/{{bookingId}}/timeline`
   - **Auth:** `Bearer {{customerToken}}`
   - **Check:** Entry with `milestone: "cancelled"`, `title: "Booking Auto-Cancelled (Payment Timeout)"`, `performedByRole: "system"`.

3. **Check Both Notifications:**
   - **Customer (`GET /notifications`):** `"Booking Cancelled (Payment Expired)"`
   - **Professional (`GET /notifications`):** `"Booking Cancelled (Unpaid Slot Released)"`

4. **Negative Check (Late Payment Attempt):**
   - Try calling `POST {{baseUrl}}/bookings/{{bookingId}}/confirm-payment` after timeout.
   - **Check:** Returns `400 Bad Request` (`"Cannot confirm payment for booking with status 'cancelled'..."`).

5. **Verify Slot Released:**
   - Creating a new booking on `2026-12-26` at `10:00` succeeds without conflict.

