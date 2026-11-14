# Flow 01: Customer Cancels Booking Before Paying or Confirming

> **Policy Rule:** If a customer cancels a booking before paying the 20% initial deposit (`status: requested` or `status: accepted`), **no charge, no cancellation fee, and no refund** will occur. The slot is simply released.

---

## 🔄 API Execution Serial

### Step 1: Create Standard Booking Request (`isQuickBooking: false`)
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
  "bookingDate": "2026-12-20",
  "startTime": "14:00",
  "guestCount": 1,
  "isQuickBooking": false,
  "usePlatformCredit": false,
  "paymentMethodId": "{{paymentMethodId}}"
}
```
- **What to Check:**
  - Status Code: `201 Created`
  - `data.booking.status` is `"requested"`
  - `data.booking.initialPayment.status` is `"pending"` (Card was NOT charged)
  - Save `data.booking._id` as `{{bookingId}}`.

---

### Step 2 *(Optional)*: Professional Accepts the Request
*Test both cancelling while in `requested` AND cancelling while in `accepted` (before deposit is paid).*
- **Method:** `PATCH`
- **URL:** `{{baseUrl}}/bookings/{{bookingId}}/accept`
- **Auth:** `Bearer {{artistToken}}`
- **What to Check:**
  - Status Code: `200 OK`
  - `data.status` is `"accepted"`
  - `data.initialPayment.dueDate` is set to ~1 hour from now.

---

### Step 3: Customer Cancels Before Payment
- **Method:** `POST`
- **URL:** `{{baseUrl}}/bookings/{{bookingId}}/customer-cancel` *(or `POST /bookings/{{bookingId}}/cancel`)*
- **Auth:** `Bearer {{customerToken}}`
- **Body:**
```json
{
  "cancellationReason": "Changed my mind before paying"
}
```
- **What to Check:**
  - Status Code: `200 OK`
  - `message`: `"Booking cancelled successfully. No payment was charged."`
  - `data.booking.status`: `"cancelled"`
  - `data.booking.cancelledByRole`: `"customer"`
  - `data.booking.cancellationFeeCharged`: `0`
  - `data.booking.depositForfeited`: `false`
  - `data.booking.platformCreditIssued`: `0`
  - `data.booking.initialPayment.status`: remains `"pending"` (NOT `"refunded"`)

---

### Step 4: Verify Booking Timeline & Artist Availability
1. **Check Timeline:**
   - **Method:** `GET`
   - **URL:** `{{baseUrl}}/bookings/{{bookingId}}/timeline`
   - **Auth:** `Bearer {{customerToken}}`
   - **Check:** Milestone `"cancelled"` recorded with description `"Customer cancelled the booking request before payment"`.
2. **Check Slot Released:**
   - Re-attempt `POST /bookings` for the same `artist`, `bookingDate: "2026-12-20"`, and `startTime: "14:00"`.
   - **Check:** Succeeds (`201 Created`) — confirms there is no double-booking conflict left on the cancelled slot.
3. **Check Notification:**
   - Check Professional notifications (`GET /notifications`) — Professional receives `"Booking Request Cancelled"`.
4. **Negative Check (Re-cancel):**
   - Call `POST /bookings/{{bookingId}}/customer-cancel` a second time.
   - **Check:** Returns `400 Bad Request` (`"Cannot cancel booking that is already 'cancelled'"`).

