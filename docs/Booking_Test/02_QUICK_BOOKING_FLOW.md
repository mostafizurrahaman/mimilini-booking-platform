# Flow 02: Quick Booking (Instant Confirmation)

> **উদ্দেশ্য:** আর্টিস্টের Availability সেটিংসে যদি `isQuickBookingEnabled: true` থাকে, তবে কাস্টমার বুকিং প্লেস করার সাথে সাথে ২০% ডিপোজিট অফ-সেশন চার্জ হয়ে যাবে এবং বুকিং তাৎক্ষণিকভাবে `confirmed` স্ট্যাটাসে চলে যাবে (কোনো আর্টিস্ট অ্যাপ্রুভালের প্রয়োজন হবে না)।

---

## 🔑 পূর্বশর্ত (Pre-conditions):
- আর্টিস্টের শিডিউলে `isQuickBookingEnabled: true` সেট থাকতে হবে।
- কাস্টমারের সেভ করা কার্ড (`paymentMethodId`) থাকতে হবে।

---

## 🏃‍♂️ ধাপসমূহ (Step-by-Step Execution):

### ধাপ ১: ইনস্ট্যান্ট বুকিং প্লেস করা (Create Instant Booking)
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
  "bookingDate": "2026-11-28",
  "startTime": "02:00 PM",
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
  "message": "Booking created and initial 20% payment processed successfully!",
  "data": {
    "booking": {
      "_id": "6714cd012345678901234002",
      "bookingNumber": "BK-2611-XYZ1",
      "status": "confirmed",
      "isQuickBooking": true,
      "initialPayment": {
        "status": "captured",
        "amount": 44,
        "stripePaymentIntentId": "pi_3Mtw..."
      }
    }
  }
}
```

📌 **নোট:** রেসপন্স থেকে `_id` সংগ্রহ করে `{{quickBookingId}}` হিসেবে রাখুন।

---

### ধাপ ২: বুকিং টাইমলাইনে ইনস্ট্যান্ট পেমেন্ট ভেরিফাই করা
- **Method:** `GET`
- **URL:** `{{baseUrl}}/bookings/{{quickBookingId}}/timeline`
- **Auth Header:** `Authorization: Bearer {{customerToken}}`
- **Expected Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "currentStatus": "confirmed",
    "timeline": [
      { "milestone": "booking_created", "status": "confirmed", "title": "Booking Created" },
      { "milestone": "payment_completed", "status": "confirmed", "title": "Payment Completed" }
    ]
  }
}
```

---

### ধাপ ৩: ইনভয়েস সাথে সাথে পাওয়া যাচ্ছে কিনা চেক করা
- **Method:** `GET`
- **URL:** `{{baseUrl}}/bookings/{{quickBookingId}}/invoice`
- **Auth Header:** `Authorization: Bearer {{customerToken}}`
- **Expected Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "stripeInvoiceId": "in_1Mtw...",
    "invoicePdf": "https://pay.stripe.com/invoice/..."
  }
}
```

🎉 **ফ্লো ০২ সফলভাবে সম্পন্ন!**
