# Flow 04: Professional Declines Booking Request

> **Policy Rule:** When a customer submits a booking request (`isQuickBooking: false` $\rightarrow$ `status: requested`), the professional can decline the request.
> - **Only allowed when status is `requested`** (cannot decline once accepted, confirmed, or in progress).
> - Customer is immediately notified with the decline reason (`NOTIFICATION_TYPE.BOOKING_DECLINED`).
> - No payment was captured, so no refund or penalty applies.
> - Slot is freed up immediately.

---

## 🔄 API Execution Serial

### Step 1: Customer Creates Standard Booking Request (`isQuickBooking: false`)
- **Method:** `POST`
- **URL:** `{{baseUrl}}/bookings`
- **Auth:** `Bearer {{customerToken}}`
- **Body:**
```json
{
  "artist": "{{artistId}}",
  "services": ["{{serviceId}}"],
  "visitType": "salon_visit",
  "bookingDate": "2026-12-22",
  "startTime": "11:00",
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

### Step 2: Check Artist Inbox Summary *(Optional)*
- **Method:** `GET`
- **URL:** `{{baseUrl}}/bookings/artist-inbox-summary`
- **Auth:** `Bearer {{artistToken}}`
- **What to Check:**
  - The booking appears in pending booking requests (`pendingRequestsCount` incremented).

---

### Step 3: Professional Declines Booking Request
- **Method:** `PATCH`
- **URL:** `{{baseUrl}}/bookings/{{bookingId}}/decline`
- **Auth:** `Bearer {{artistToken}}`
- **Body:**
```json
{
  "reason": "Unavailable at this time due to overlapping private event"
}
```
- **What to Check:**
  - Status Code: `200 OK`
  - `data.status`: `"declined"`
  - `data.cancelledByRole`: `"artist"`
  - `data.cancellationReason`: `"Unavailable at this time due to overlapping private event"`

---

### Step 4: Verify Customer Notification & Timeline
1. **Check Customer Notification:**
   - **Method:** `GET`
   - **URL:** `{{baseUrl}}/notifications`
   - **Auth:** `Bearer {{customerToken}}`
   - **Check:** Notification with `title: "Booking Declined"`, `type: "booking_declined"`, containing the professional's name and reason.
2. **Check Timeline:**
   - **Method:** `GET`
   - **URL:** `{{baseUrl}}/bookings/{{bookingId}}/timeline`
   - **Auth:** `Bearer {{customerToken}}`
   - **Check:** Milestone `"declined"` recorded.
3. **Check Slot Availability:**
   - Another customer (or same customer) can book `2026-12-22` at `11:00` without conflict.

---

### Step 5: Negative Validation Tests *(Status Transition Guards)*
1. **Try declining an `accepted` or `confirmed` booking:**
   - Create another booking, accept it (`PATCH /accept`), then call `PATCH /decline`.
   - **Expected:** `400 Bad Request` — `"Cannot decline booking with status 'accepted'. Only requested bookings can be declined."`
2. **Try declining by wrong user / another artist:**
   - Call `PATCH /decline` with `customerToken` or another artist's token.
   - **Expected:** `403 Forbidden`.
3. **Try declining an already declined booking:**
   - Call `PATCH /decline` again on `{{bookingId}}`.
   - **Expected:** `400 Bad Request`.

