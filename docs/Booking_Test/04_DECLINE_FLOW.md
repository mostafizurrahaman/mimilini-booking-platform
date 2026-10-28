# Flow 04: Artist Decline Flow

> **উদ্দেশ্য:** কাস্টমার বুকিং রিকোয়েস্ট পাঠানোর পর আর্টিস্ট যদি অন্য ব্যস্ততা বা সুবিধার অভাবে বুকিংটি রিজেক্ট/ডিক্লাইন করে।

---

## 🏃‍♂️ ধাপসমূহ (Step-by-Step Execution):

### ধাপ ১: একটি বুকিং রিকোয়েস্ট তৈরি করা
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
  "bookingDate": "2026-11-26",
  "startTime": "11:00 AM",
  "guestCount": 1,
  "paymentMethodId": "{{paymentMethodId}}",
  "usePlatformCredit": false
}
```
- **Save:** রেসপন্স থেকে `booking._id` সংগ্রহ করে `{{declineBookingId}}` হিসেবে রাখুন (Status থাকবে: `requested`)।

---

### ধাপ ২: আর্টিস্ট বুকিং রিকোয়েস্ট ডিক্লাইন করা (Decline Booking)
- **Method:** `PATCH`
- **URL:** `{{baseUrl}}/bookings/{{declineBookingId}}/decline`
- **Auth Header:** `Authorization: Bearer {{artistToken}}`
- **Body:**
```json
{
  "reason": "Fully booked outside platform on this specific time slot."
}
```

- **Expected Response (200 OK):**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Booking declined successfully!",
  "data": {
    "_id": "{{declineBookingId}}",
    "status": "declined",
    "cancellationReason": "Fully booked outside platform on this specific time slot."
  }
}
```

---

### ধাপ ৩: টাইমলাইনে Decline অডিট দেখা
- **Method:** `GET`
- **URL:** `{{baseUrl}}/bookings/{{declineBookingId}}/timeline`
- **Auth Header:** `Authorization: Bearer {{customerToken}}`
- **Expected Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "currentStatus": "declined",
    "timeline": [
      { "milestone": "booking_created", "status": "requested" },
      { "milestone": "declined", "status": "declined", "title": "Booking Declined" }
    ]
  }
}
```

🎉 **ফ্লো ০৪ সফলভাবে সম্পন্ন!**
