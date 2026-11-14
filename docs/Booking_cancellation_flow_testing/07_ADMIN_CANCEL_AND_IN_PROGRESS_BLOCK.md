# Flow 07: Completed Cancellation Block & Admin Override Cancellation

> **Policy Rules:**
> 1. Note: Service `startService` / `in_progress` step has been removed; bookings transition directly from `confirmed` to `completed`.
> 2. Once a booking is `completed`, neither customer nor professional can cancel it.
> 3. **Admin / Super Admin** has override permission via `POST /bookings/:id/cancel` to cancel a booking (e.g., for dispute or emergency intervention) prior to completion.
> 4. Admin cancellation voids/credit-notes Stripe invoices, records history as `admin`, and notifies **both** customer and professional.

---

## 🔄 API Execution Serial

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
  "bookingDate": "2026-12-27",
  "startTime": "13:00",
  "guestCount": 1,
  "isQuickBooking": true,
  "usePlatformCredit": false,
  "paymentMethodId": "{{paymentMethodId}}"
}
```
- **Check:** `data.booking.status` is `"confirmed"`. Save `data.booking._id` as `{{bookingId}}`.

---

### Step 2: Professional Completes Service Directly from Confirmed
- **Method:** `POST`
- **URL:** `{{baseUrl}}/bookings/{{bookingId}}/complete`
- **Auth:** `Bearer {{artistToken}}`
- **What to Check:**
  - Status Code: `200 OK`
  - `data.status`: `"completed"`

---

### Step 3: Negative Check — Customer Tries to Cancel Completed Booking
- **Method:** `POST`
- **URL:** `{{baseUrl}}/bookings/{{bookingId}}/customer-cancel` *(and test `/cancel` with `customerToken`)*
- **Auth:** `Bearer {{customerToken}}`
- **Body:**
```json
{
  "cancellationReason": "Trying to cancel completed booking"
}
```
- **What to Check:**
  - Status Code: `400 Bad Request`
  - `message`: `"Cannot cancel booking that is already 'completed'"`

---

### Step 4: Admin Executes Override Cancellation
- **Method:** `POST`
- **URL:** `{{baseUrl}}/bookings/{{bookingId}}/cancel`
- **Auth:** `Bearer {{adminToken}}`
- **Body:**
```json
{
  "cancellationReason": "Admin cancelled due to mutual dispute during active service"
}
```
- **What to Check:**
  - Status Code: `200 OK`
  - `data.booking.status`: `"cancelled"`
  - `data.booking.cancelledByRole`: `"admin"`
  - `data.booking.cancellationReason`: `"Admin cancelled due to mutual dispute during active service"`

---

### Step 6: Verify Timeline, Invoices & Notifications
1. **Timeline (`GET {{baseUrl}}/bookings/{{bookingId}}/timeline` with Admin/Customer Token):**
   - Check milestone `"cancelled"` with `title: "Booking Cancelled by Admin"` and `performedByRole: "admin"`.
2. **Notifications (`GET {{baseUrl}}/notifications`):**
   - **Customer:** Receives `"Booking Cancelled by Admin"`.
   - **Professional:** Receives `"Booking Cancelled by Admin"`.
3. **Negative Check on Terminal Status:**
   - Try calling `POST /complete` or `POST /sign` or `PATCH /accept` on `{{bookingId}}`.
   - **Check:** All return `400 Bad Request` (`cancelled` is terminal).

