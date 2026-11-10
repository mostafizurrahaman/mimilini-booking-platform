# Flow 07: In-Progress Cancellation Block & Admin Override Cancellation

> **Policy Rules:**
> 1. Once a service has started (`status: in_progress`), **neither Customer nor Professional** can self-cancel the booking.
> 2. **Admin / Super Admin** has override permission via `POST /bookings/:id/cancel` to cancel even an `in_progress` booking (e.g., for dispute or emergency intervention).
> 3. Admin cancellation voids/credit-notes Stripe invoices, records history as `admin`, and notifies **both** customer and professional.

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

### Step 2: Professional Starts the Service (`confirmed` $\rightarrow$ `in_progress`)
- **Method:** `PATCH`
- **URL:** `{{baseUrl}}/bookings/{{bookingId}}/start-service`
- **Auth:** `Bearer {{artistToken}}`
- **What to Check:**
  - Status Code: `200 OK`
  - `data.status`: `"in_progress"`

---

### Step 3: Negative Check — Customer Tries to Cancel During Service
- **Method:** `POST`
- **URL:** `{{baseUrl}}/bookings/{{bookingId}}/customer-cancel` *(and test `/cancel` with `customerToken`)*
- **Auth:** `Bearer {{customerToken}}`
- **Body:**
```json
{
  "cancellationReason": "Trying to cancel mid-service"
}
```
- **What to Check:**
  - Status Code: `400 Bad Request`
  - `message`: `"Cannot cancel a booking that is currently in progress. Please contact the professional or support."`
  - Booking remains `"in_progress"`.

---

### Step 4: Negative Check — Professional Tries to Cancel During Service
- **Method:** `POST`
- **URL:** `{{baseUrl}}/bookings/{{bookingId}}/artist-cancel` *(and test `/cancel` with `artistToken`)*
- **Auth:** `Bearer {{artistToken}}`
- **Body:**
```json
{
  "cancellationReason": "Trying to cancel mid-service"
}
```
- **What to Check:**
  - Status Code: `400 Bad Request`
  - `message`: `"Cannot cancel a booking that is currently in progress. Please contact the professional or support."`
  - Booking remains `"in_progress"`.

---

### Step 5: Admin Executes Override Cancellation
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

