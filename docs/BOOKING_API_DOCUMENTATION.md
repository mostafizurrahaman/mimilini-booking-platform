# Mimilini Booking Platform - Booking APIs Documentation

**Base URL:** `http://localhost:5000/api/v1/bookings` (or `http://localhost:8080/api/v1/bookings` depending on `.env` `PORT`)  
**Auth:** Bearer JWT token in header: `Authorization: Bearer <token>`

---

## Quick Reference: All 18 Booking Endpoints

| # | Method | Endpoint | Allowed Roles | Description |
|---|--------|----------|---------------|-------------|
| 1 | `POST` | `/preview` | Customer, Artist, Admin, Super Admin | Pre-booking financial breakdown (deposit, balance, fees, GST, promo) |
| 2 | `POST` | `/` | Customer | Create a booking request and reserve initial slot |
| 3 | `GET` | `/my-bookings` | Customer, Artist, Admin, Super Admin | List bookings with tabs (`upcoming`, `pending`, `completed`, `cancelled`) |
| 4 | `GET` | `/:id` | Customer, Artist, Admin, Super Admin | Get detailed booking information by MongoDB ID |
| 5 | `GET` | `/artist-inbox-summary` | Artist, Admin, Super Admin | Artist inbox metrics (unread count, pending requests, upcoming count) |
| 6 | `PATCH`| `/:id/accept` | Artist, Admin, Super Admin | Artist accepts a `requested` booking |
| 7 | `PATCH`| `/:id/decline` | Artist, Admin, Super Admin | Artist declines a `requested` booking with reason |
| 8 | `POST` | `/:id/confirm-payment` | Customer | Pay 20% deposit off-session via Stripe and transition status to `confirmed` |
| 9 | `POST` | `/:id/pay-balance` | Customer | Settle the remaining 80% balance |
| 10 | `POST`| `/:id/complete` | Artist, Admin, Super Admin | Complete booking with work proof photos upload |
| 11 | `POST`| `/:id/sign` | Customer, Admin, Super Admin | Customer submits digital signature confirming completion |
| 12 | `POST`| `/:id/cancel` | Customer, Artist, Admin, Super Admin | Cancel booking with automated refund/fee/penalty policy calculation |
| 13 | `POST`| `/:id/reschedule-request` | Customer, Artist, Admin, Super Admin | Submit a reschedule request for a new date/time |
| 14 | `POST`| `/:id/reschedule-respond` | Customer, Artist, Admin, Super Admin | Accept or decline a proposed reschedule |
| 15 | `GET` | `/:id/invoice` | Customer, Artist, Admin, Super Admin | ATO-compliant Customer Tax Invoice breakdown & Stripe invoice reference |
| 16 | `GET` | `/:id/receipt` | Customer, Admin, Super Admin | 80% balance payment proof receipt |
| 17 | `GET` | `/:id/artist-invoice` | Artist, Admin, Super Admin | Recipient Created Tax Invoice (RCTI) for artist payout |
| 18 | `POST`| `/:id/report-no-show` | Artist | Artist reports customer did not show up |
| 19 | `POST`| `/:id/verify-no-show` | Admin, Super Admin | Admin verifies no-show dispute and releases artist compensation |

---

## 1. Checkout & Booking Creation

### 1.1 Checkout Financial Preview
- **Endpoint:** `POST /api/v1/bookings/preview`
- **Roles:** `customer`, `artist`, `admin`, `super_admin`
- **Description:** Real-time calculation of service total, 20% deposit, 80% balance, travel fees, promo discount, platform commission, GST breakdown, and artist net payout.
- **Request Body (JSON):**
```json
{
  "artist": "67b000000000000000000001",
  "service": "67b000000000000000000002",
  "guestCount": 1,
  "visitType": "salon_visit",
  "address": "67b000000000000000000003",
  "promoCode": "WELCOME10",
  "usePlatformCredit": false
}
```
- **Response (200 OK):**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Checkout financial breakdown preview calculated successfully!",
  "data": {
    "servicePrice": 150.00,
    "guestCount": 1,
    "travelFee": 0.00,
    "promoDiscount": 15.00,
    "grossTotal": 135.00,
    "depositAmount": 27.00,
    "balanceAmount": 108.00,
    "platformCommissionAmount": 13.50,
    "artistNetPayout": 121.50,
    "gstDetails": {
      "isGstRegistered": true,
      "gstIncluded": 12.27
    }
  }
}
```

---

### 1.2 Create Booking
- **Endpoint:** `POST /api/v1/bookings`
- **Roles:** `customer`
- **Description:** Places booking in `requested` state and saves initial payment intents.
- **Request Body (JSON):**
```json
{
  "artist": "67b000000000000000000001",
  "service": "67b000000000000000000002",
  "visitType": "salon_visit",
  "address": "67b000000000000000000003",
  "bookingDate": "2026-11-20",
  "startTime": "10:00 AM",
  "guestCount": 1,
  "promoCode": "",
  "usePlatformCredit": false,
  "paymentMethodId": "pm_card_visa"
}
```
- **Response (201 Created):**
```json
{
  "success": true,
  "statusCode": 201,
  "message": "Booking created and initial 20% payment processed successfully!",
  "data": {
    "_id": "67b1234567890abcdef12345",
    "bookingNumber": "BKG-20261120-001",
    "customer": "67a000000000000000000010",
    "artist": "67b000000000000000000001",
    "status": "requested",
    "bookingDate": "2026-11-20T00:00:00.000Z",
    "startTime": "10:00",
    "totalPrice": 150.00,
    "depositAmount": 30.00,
    "balanceAmount": 120.00
  }
}
```

---

## 2. Booking Queries & Artist Dashboard

### 2.1 Get My Bookings
- **Endpoint:** `GET /api/v1/bookings/my-bookings`
- **Roles:** `customer`, `artist`, `admin`, `super_admin`
- **Query Parameters:**
  - `tab` (optional): `all` | `upcoming` | `pending` | `new_requests` | `completed` | `cancelled`
  - `page` (optional, default `1`): page number
  - `limit` (optional, default `10`): records per page
- **Response (200 OK):**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Bookings retrieved successfully!",
  "data": [
    {
      "_id": "67b1234567890abcdef12345",
      "bookingNumber": "BKG-20261120-001",
      "status": "confirmed",
      "bookingDate": "2026-11-20T00:00:00.000Z",
      "startTime": "10:00",
      "totalPrice": 150.00
    }
  ],
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 1,
    "totalPage": 1
  }
}
```

---

### 2.2 Get Booking By ID
- **Endpoint:** `GET /api/v1/bookings/:id`
- **Roles:** `customer`, `artist`, `admin`, `super_admin`
- **Response (200 OK):**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Booking details retrieved successfully!",
  "data": {
    "_id": "67b1234567890abcdef12345",
    "bookingNumber": "BKG-20261120-001",
    "status": "confirmed",
    "customer": { "_id": "...", "name": "Jane Doe", "email": "jane@example.com" },
    "artist": { "_id": "...", "name": "Artist Studio", "email": "artist@example.com" },
    "service": { "_id": "...", "name": "Bridal Makeup", "price": 150.00 },
    "financials": {
      "servicePrice": 150.00,
      "depositAmount": 30.00,
      "balanceAmount": 120.00
    }
  }
}
```

---

### 2.3 Artist Inbox Summary
- **Endpoint:** `GET /api/v1/bookings/artist-inbox-summary`
- **Roles:** `artist`, `admin`, `super_admin`
- **Response (200 OK):**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Artist inbox summary retrieved successfully!",
  "data": {
    "pendingRequestsCount": 3,
    "upcomingBookingsCount": 8,
    "rescheduleRequestsCount": 1,
    "unreadMessagesCount": 4
  }
}
```

---

## 3. Booking Lifecycle Transitions

### 3.1 Accept Booking
- **Endpoint:** `PATCH /api/v1/bookings/:id/accept`
- **Roles:** `artist`, `admin`, `super_admin`
- **Description:** Moves booking from `requested` to `accepted`.
- **Response (200 OK):**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Booking accepted successfully!",
  "data": {
    "_id": "67b1234567890abcdef12345",
    "status": "accepted"
  }
}
```

---

### 3.2 Decline Booking
- **Endpoint:** `PATCH /api/v1/bookings/:id/decline`
- **Roles:** `artist`, `admin`, `super_admin`
- **Request Body (JSON):**
```json
{
  "reason": "Studio is booked for an external photoshoot at this hour."
}
```
- **Response (200 OK):**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Booking declined successfully!",
  "data": {
    "_id": "67b1234567890abcdef12345",
    "status": "declined",
    "declineReason": "Studio is booked for an external photoshoot at this hour."
  }
}
```

---

### 3.3 Confirm Payment (Initial 20% Deposit)
- **Endpoint:** `POST /api/v1/bookings/:id/confirm-payment`
- **Roles:** `customer`
- **Description:** Charges the 20% deposit from the customer's payment method, marks `initialPayment.status` as `captured`, and transitions booking to `confirmed`.
- **Request Body (JSON):**
```json
{
  "paymentMethodId": "pm_card_visa",
  "usePlatformCredit": false
}
```
- **Response (200 OK):**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Booking confirmed and deposit paid successfully!",
  "data": {
    "_id": "67b1234567890abcdef12345",
    "status": "confirmed",
    "initialPayment": {
      "amount": 30.00,
      "status": "captured",
      "transactionId": "pi_3MtwBwLkdIwHu7ix28a3tqPa"
    }
  }
}
```

---

### 3.4 Settle 80% Remaining Balance
- **Endpoint:** `POST /api/v1/bookings/:id/pay-balance`
- **Roles:** `customer`
- **Description:** Allows customer to settle the 80% remaining balance on demand before or after service completion.
- **Request Body (JSON):**
```json
{
  "paymentMethodId": "pm_card_visa"
}
```
- **Response (200 OK):**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Balance paid successfully!",
  "data": {
    "_id": "67b1234567890abcdef12345",
    "balancePayment": {
      "amount": 120.00,
      "status": "captured"
    }
  }
}
```

---

### 3.5 Complete Booking (Artist Work Proof Upload)
- **Endpoint:** `POST /api/v1/bookings/:id/complete`
- **Roles:** `artist`, `admin`, `super_admin`
- **Content-Type:** `multipart/form-data`
- **Form Data Fields:**
  - `proofPhotos`: File(s) (up to 6 images, JPEG/PNG, max 10MB each)
  - `servicesPerformed`: `string` (e.g., "Full glam bridal makeup and hair curling")
  - `productsUsed`: `string` (e.g., "Charlotte Tilbury Magic Cream, NARS Natural Radiant")
  - `totalWorkingTime`: `string` (e.g., "2 hours 30 mins")
  - `specialNotes`: `string` (optional notes)
- **Response (200 OK):**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Booking completed successfully!",
  "data": {
    "_id": "67b1234567890abcdef12345",
    "status": "completed",
    "completedAt": "2026-11-20T12:45:00.000Z",
    "completionDetails": {
      "servicesPerformed": "Full glam bridal makeup and hair curling",
      "proofPhotos": ["https://cdn.mimilini.com/proof-1.jpg"]
    }
  }
}
```

---

### 3.6 Customer Signature (Customer Sign-off)
- **Endpoint:** `POST /api/v1/bookings/:id/sign`
- **Roles:** `customer`, `admin`, `super_admin`
- **Description:** Dedicated endpoint allowing the customer to digitally sign off on service completion and satisfaction.
- **Request Body (JSON):**
```json
{
  "customerSignature": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
}
```
- **Response (200 OK):**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Customer signature submitted successfully!",
  "data": {
    "_id": "67b1234567890abcdef12345",
    "completionDetails": {
      "customerSignature": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg...",
      "signedAt": "2026-11-20T12:50:00.000Z"
    }
  }
}
```

---

### 3.7 Cancel Booking
- **Endpoint:** `POST /api/v1/bookings/:id/cancel`
- **Roles:** `customer`, `artist`, `admin`, `super_admin`
- **Description:** Enforces platform cancellation rules. If cancelled $>24\text{h}$ prior, deposit is refunded; if $<24\text{h}$, deposit is retained or artist is assessed late cancellation penalty.
- **Request Body (JSON):**
```json
{
  "reason": "Sudden fever and sickness."
}
```
- **Response (200 OK):**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Booking cancelled successfully. Deposit refunded per policy.",
  "data": {
    "_id": "67b1234567890abcdef12345",
    "status": "cancelled",
    "cancelledAt": "2026-11-18T09:00:00.000Z"
  }
}
```

---

## 4. Rescheduling Workflow

### 4.1 Request Reschedule
- **Endpoint:** `POST /api/v1/bookings/:id/reschedule-request`
- **Roles:** `customer`, `artist`, `admin`, `super_admin`
- **Request Body (JSON):**
```json
{
  "newDate": "2026-11-25",
  "newStartTime": "02:00 PM",
  "reason": "Flight rescheduled to evening.",
  "message": "Can we move our session to 2:00 PM?"
}
```
- **Response (200 OK):**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Reschedule request submitted successfully!",
  "data": {
    "_id": "67b1234567890abcdef12345",
    "reschedule": {
      "proposedDate": "2026-11-25T00:00:00.000Z",
      "proposedStartTime": "14:00",
      "status": "pending_response"
    }
  }
}
```

---

### 4.2 Respond to Reschedule
- **Endpoint:** `POST /api/v1/bookings/:id/reschedule-respond`
- **Roles:** `customer`, `artist`, `admin`, `super_admin`
- **Request Body (JSON):**
```json
{
  "action": "accept",
  "declineReason": ""
}
```
*(Or `"action": "decline", "declineReason": "Slot unavailable"`)*
- **Response (200 OK):**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Reschedule request accepted and booking updated!",
  "data": {
    "_id": "67b1234567890abcdef12345",
    "bookingDate": "2026-11-25T00:00:00.000Z",
    "startTime": "14:00",
    "status": "confirmed"
  }
}
```

---

## 5. Invoicing & Financial Receipts

### 5.1 Customer Tax Invoice
- **Endpoint:** `GET /api/v1/bookings/:id/invoice`
- **Roles:** `customer`, `artist`, `admin`, `super_admin`
- **Response (200 OK):**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Booking tax invoice retrieved successfully!",
  "data": {
    "invoiceNumber": "INV-2026-00123",
    "bookingNumber": "BKG-20261120-001",
    "customer": { "name": "Jane Doe", "email": "jane@example.com" },
    "issuedAt": "2026-11-20T10:00:00.000Z",
    "items": [
      {
        "description": "Bridal Makeup Service",
        "amount": 150.00,
        "gst": 13.64
      }
    ],
    "subTotal": 136.36,
    "gstTotal": 13.64,
    "total": 150.00,
    "paidAmount": 30.00,
    "balanceDue": 120.00
  }
}
```

---

### 5.2 Balance Payment Receipt
- **Endpoint:** `GET /api/v1/bookings/:id/receipt`
- **Roles:** `customer`, `admin`, `super_admin`
- **Response (200 OK):**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Booking 80% balance payment receipt retrieved successfully!",
  "data": {
    "receiptNumber": "REC-2026-00089",
    "bookingId": "67b1234567890abcdef12345",
    "paidAt": "2026-11-20T13:00:00.000Z",
    "paymentMethod": "Visa ending in 4242",
    "amountPaid": 120.00,
    "currency": "aud",
    "status": "succeeded"
  }
}
```

---

### 5.3 Artist Recipient Created Tax Invoice (RCTI)
- **Endpoint:** `GET /api/v1/bookings/:id/artist-invoice`
- **Roles:** `artist`, `admin`, `super_admin`
- **Response (200 OK):**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Artist Recipient Created Tax Invoice (RCTI) retrieved successfully!",
  "data": {
    "rctiNumber": "RCTI-2026-00054",
    "artist": {
      "businessName": "Glam by Sarah Pty Ltd",
      "abn": "12 345 678 901",
      "isGstRegistered": true
    },
    "grossBookingAmount": 150.00,
    "platformCommission": 15.00,
    "gstOnCommission": 1.50,
    "netPayout": 133.50,
    "payoutStatus": "scheduled"
  }
}
```

---

## 6. Customer No-Show Handling

### 6.1 Report Customer No-Show (Artist)
- **Endpoint:** `POST /api/v1/bookings/:id/report-no-show`
- **Roles:** `artist`
- **Request Body (JSON):**
```json
{
  "reason": "Waited 30 minutes at client address. Phone calls and texts not answered.",
  "isSafetyConcern": false
}
```
- **Response (200 OK):**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Customer no-show reported successfully. Status set to no_show_pending for admin review.",
  "data": {
    "_id": "67b1234567890abcdef12345",
    "status": "no_show_pending"
  }
}
```

---

### 6.2 Verify Customer No-Show (Admin)
- **Endpoint:** `POST /api/v1/bookings/:id/verify-no-show`
- **Roles:** `admin`, `super_admin`
- **Request Body (JSON):**
```json
{
  "isApproved": true,
  "adminNotes": "Confirmed artist check-in timestamp and client unreachability. Approved."
}
```
- **Response (200 OK):**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "No-show verified and approved. Payout scheduled to artist.",
  "data": {
    "_id": "67b1234567890abcdef12345",
    "status": "no_show"
  }
}
```
