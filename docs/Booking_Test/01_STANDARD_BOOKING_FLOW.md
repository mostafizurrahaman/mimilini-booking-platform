# Flow 01: Standard Booking & Full Service Completion (Happy Path)

> **উদ্দেশ্য:** এই ফ্লো-তে কাস্টমার সাধারণ বুকিং রিকোয়েস্ট পাঠাবে (কোনো ইনস্ট্যান্ট পেমেন্ট হবে না) ➔ আর্টিস্ট অনুমোদন করবে ➔ কাস্টমার ২০% ডিপোজিট পে করবে ➔ অ্যাপয়েন্টমেন্টের ২৪ ঘণ্টা আগে ৮০% ব্যালেন্স পে করবে ➔ আর্টিস্ট প্রুফ ছবি সহ সার্ভিস কমপ্লিট করবে ➔ কাস্টমার সাইন করবে ➔ ইনভয়েস ডাউনলোড হবে।

---

## 🔑 প্রয়োজনীয় ভ্যারিয়েবল (Setup Variables):
| Variable | মান / উদাহরণ | কার টোকেন? |
|---|---|---|
| `baseUrl` | `http://localhost:8080/api/v1` | - |
| `customerToken` | `Bearer eyJ...` | Customer |
| `artistToken` | `Bearer eyJ...` | Artist |
| `artistId` | `6714ab012345678901234567` | Artist User `_id` |
| `serviceId` | `67123def456abc7890123456` | Artist Service `_id` |
| `addressId` | `67100add00112233445566778` | Customer Address `_id` |
| `paymentMethodId` | `pm_card_visa` বা PaymentMethod `_id` | Customer Card |

---

## 🏃‍♂️ ধাপসমূহ (Step-by-Step Execution):

### ধাপ ১: চেকাউট ফিনান্সিয়াল প্রিভিউ
*বুকিং করার আগে কাস্টমার মোট টাকা, ২০% ডিপোজিট ও ট্রাভেল ফি প্রিভিউ করবে।*

- **Method:** `POST`
- **URL:** `{{baseUrl}}/bookings/preview`
- **Auth Header:** `Authorization: Bearer {{customerToken}}`
- **Body:**
```json
{
  "artist": "{{artistId}}",
  "service": "{{serviceId}}",
  "guestCount": 1,
  "visitType": "home_visit",
  "address": "{{addressId}}",
  "usePlatformCredit": false
}
```
- **Expected Response (200 OK):**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Checkout financial breakdown preview calculated successfully!",
  "data": {
    "servicePrice": 200,
    "travelFee": 20,
    "totalBookingPrice": 220,
    "initialDepositAmount": 44,
    "balanceDueAmount": 176
  }
}
```

---

### ধাপ ২: বুকিং রিকোয়েস্ট প্লেস করা (Create Booking Request)
*আর্টিস্টের Quick Booking বন্ধ থাকায় সাথে সাথে কোনো টাকা কাটবে না, বুকিংটি `requested` হিসেবে তৈরি হবে।*

- **Method:** `POST`
- **URL:** `{{baseUrl}}/bookings`
- **Auth Header:** `Authorization: Bearer {{customerToken}}`
- **Body:**
```json
{
  "artist": "{{artistId}}",
  "service": "{{serviceId}}",
  "visitType": "home_visit",
  "address": "{{addressId}}",
  "bookingDate": "2026-11-25",
  "startTime": "10:00 AM",
  "guestCount": 1,
  "paymentMethodId": "{{paymentMethodId}}",
  "usePlatformCredit": false
}
```
- **Expected Response (201 Created):**
```json
{
  "success": true,
  "statusCode": 201,
  "message": "Booking request submitted successfully! Awaiting artist approval.",
  "data": {
    "booking": {
      "_id": "6714cd012345678901234001",
      "bookingNumber": "BK-2611-ABCD",
      "status": "requested"
    }
  }
}
```
📌 **নোট:** রেসপন্স থেকে `booking._id` সংগ্রহ করে পরবর্তী স্টেপগুলোতে `{{bookingId}}` হিসেবে ব্যবহার করুন।

---

### ধাপ ৩: আর্টিস্ট ইনবক্স চেক (Inbox Summary)
*আর্টিস্ট তার ড্যাশবোর্ডে নতুন বুকিং রিকোয়েস্ট এসেছে কিনা চেক করবে।*

- **Method:** `GET`
- **URL:** `{{baseUrl}}/bookings/artist-inbox-summary`
- **Auth Header:** `Authorization: Bearer {{artistToken}}`
- **Expected Response (200 OK):**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Artist inbox summary retrieved successfully!",
  "data": {
    "allTime": {
      "pendingRequestsCount": 1
    }
  }
}
```

---

### ধাপ ৪: আর্টিস্ট বুকিং রিকোয়েস্ট একসেপ্ট করা (Accept Booking)
*আর্টিস্ট রিকোয়েস্টটি অনুমোদন করবে।*

- **Method:** `PATCH`
- **URL:** `{{baseUrl}}/bookings/{{bookingId}}/accept`
- **Auth Header:** `Authorization: Bearer {{artistToken}}`
- **Expected Response (200 OK):**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Booking accepted successfully!",
  "data": {
    "_id": "{{bookingId}}",
    "status": "accepted"
  }
}
```

---

### ধাপ ৫: কাস্টমার ২০% ডিপোজিট পে করে বুকিং কনফার্ম করা
*আর্টিস্ট একসেপ্ট করার পর কাস্টমার ২০% ডিপোজিট পেমেন্ট সম্পন্ন করবে।*

- **Method:** `POST`
- **URL:** `{{baseUrl}}/bookings/{{bookingId}}/confirm-payment`
- **Auth Header:** `Authorization: Bearer {{customerToken}}`
- **Body:**
```json
{
  "paymentMethodId": "{{paymentMethodId}}",
  "usePlatformCredit": false
}
```
- **Expected Response (200 OK):**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Booking confirmed and deposit paid successfully!",
  "data": {
    "booking": {
      "_id": "{{bookingId}}",
      "status": "confirmed",
      "initialPayment": {
        "status": "captured",
        "amount": 44
      }
    }
  }
}
```

---

### ধাপ ৬: বুকিং টাইমলাইন ইভেন্ট চেক করা
*ক্রোনোলজিক্যাল অডিট লগ দেখা (Booking Created ➔ Artist Accepted ➔ Payment Completed)।*

- **Method:** `GET`
- **URL:** `{{baseUrl}}/bookings/{{bookingId}}/timeline`
- **Auth Header:** `Authorization: Bearer {{customerToken}}`
- **Expected Response (200 OK):**
```json
{
  "success": true,
  "statusCode": 200,
  "data": {
    "bookingNumber": "BK-2611-ABCD",
    "currentStatus": "confirmed",
    "timeline": [
      { "milestone": "booking_created", "status": "requested", "title": "Booking Created" },
      { "milestone": "artist_accepted", "status": "accepted", "title": "Artist Accepted" },
      { "milestone": "payment_completed", "status": "confirmed", "title": "Deposit Paid & Confirmed" }
    ]
  }
}
```

---

### ধাপ ৭: কাস্টমার Stripe Tax Invoice ডাউনলোড
- **Method:** `GET`
- **URL:** `{{baseUrl}}/bookings/{{bookingId}}/invoice`
- **Auth Header:** `Authorization: Bearer {{customerToken}}`
- **Expected Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "stripeInvoiceId": "in_1MtwLwLkdIwHu7ix...",
    "invoicePdf": "https://pay.stripe.com/invoice/...",
    "hostedInvoiceUrl": "https://invoice.stripe.com/..."
  }
}
```

---

### ধাপ ৮: অ্যাপয়েন্টমেন্টের ২৪ ঘণ্টা আগে ৮০% ব্যালেন্স পেমেন্ট করা
*বাকি ৮০% ব্যালেন্স পরিশোধ করা।*

- **Method:** `POST`
- **URL:** `{{baseUrl}}/bookings/{{bookingId}}/pay-balance`
- **Auth Header:** `Authorization: Bearer {{customerToken}}`
- **Body:**
```json
{
  "paymentMethodId": "{{paymentMethodId}}"
}
```
- **Expected Response (200 OK):**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Remaining 80% balance paid successfully!",
  "data": {
    "booking": {
      "status": "confirmed",
      "balancePayment": {
        "status": "captured",
        "amount": 176
      }
    }
  }
}
```

---

### ধাপ ৯: ব্যালেন্স পেমেন্ট রিসিট ডাউনলোড
- **Method:** `GET`
- **URL:** `{{baseUrl}}/bookings/{{bookingId}}/receipt`
- **Auth Header:** `Authorization: Bearer {{customerToken}}`
- **Expected Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "receiptUrl": "https://pay.stripe.com/receipts/..."
  }
}
```

---

### ধাপ ১০: আর্টিস্ট প্রুফ ছবি আপলোড করে সার্ভিস সম্পন্ন করা
- **Method:** `POST`
- **URL:** `{{baseUrl}}/bookings/{{bookingId}}/complete`
- **Auth Header:** `Authorization: Bearer {{artistToken}}`
- **Content-Type:** `multipart/form-data`
- **Form Data:**
  - `specialNotes`: `"Bridal makeup and hair styling completed."`
  - `proofPhotos`: *(যেকোনো ১-৩টি ছবি ফাইল সিলেক্ট করুন)*
- **Expected Response (200 OK):**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Booking marked as completed successfully!",
  "data": {
    "status": "completed",
    "completionDetails": {
      "specialNotes": "Bridal makeup and hair styling completed."
    }
  }
}
```

---

### ধাপ ১১: কাস্টমার সাইন দেওয়া (Sign-Off)
- **Method:** `POST`
- **URL:** `{{baseUrl}}/bookings/{{bookingId}}/sign`
- **Auth Header:** `Authorization: Bearer {{customerToken}}`
- **Body:**
```json
{
  "customerSignature": "Sarah Connor"
}
```
- **Expected Response (200 OK):**
```json
{
  "success": true,
  "message": "Completion signature recorded successfully."
}
```

---

### ধাপ ১২: আর্টিস্টের RCTI (Self-Billed Invoice) দেখা
- **Method:** `GET`
- **URL:** `{{baseUrl}}/bookings/{{bookingId}}/artist-invoice`
- **Auth Header:** `Authorization: Bearer {{artistToken}}`
- **Expected Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "artistInvoiceId": "in_1MtwArtistRCTI...",
    "invoicePdf": "https://pay.stripe.com/..."
  }
}
```

---

### ধাপ ১৩: সিঙ্গেল বুকিং ডিটেইলস দেখা
- **Method:** `GET`
- **URL:** `{{baseUrl}}/bookings/{{bookingId}}`
- **Auth Header:** `Authorization: Bearer {{customerToken}}`
- **Expected Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "_id": "{{bookingId}}",
    "status": "completed",
    "isQuickBooking": false
  }
}
```
🎉 **ফ্লো ০১ সফলভাবে সম্পন্ন!**
