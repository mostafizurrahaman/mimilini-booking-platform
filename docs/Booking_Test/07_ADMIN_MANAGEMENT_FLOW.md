# Flow 07: Admin Booking Management & Dashboard Flow

> **উদ্দেশ্য:** অ্যাডমিন প্যানেল স্ক্রিনসমূহ টেস্ট করা (Figma Admin/1.png, Admin/5.png, Admin/6.png):
> 1. শীর্ষ ৫টি মেগা KPI মেট্রিক কার্ড (`totalBookings`, `todayBookings`, `pending`, `completed`, `cancelled`) সহ সব বুকিংয়ের টেবিল।
> 2. ড্যাশবোর্ডের জন্য সাম্প্রতিক ৬টি বুকিং কার্ড।
> 3. পূর্ণাঙ্গ স্ট্রাকচার্ড বুকিং ডিটেইলস (বুকিং তথ্য, কাস্টমার তথ্য, আর্টিস্ট তথ্য, সার্ভিস বিবরণ, পেমেন্ট ব্রেকডাউন, ইনভয়েস লিংক)।
> 4. `BookingHistory` থেকে ক্রোনোলজিক্যাল অডিট ট্রেইল টাইমলাইন।
> 5. বুকিংয়ে অ্যাডমিন ইন্টারনাল নোট সেভ/আপডেট করা।

---

## 🏃‍♂️ ধাপসমূহ (Step-by-Step Execution):

### ধাপ ১: অ্যাডমিন - সব বুকিং তালিকা ও শীর্ষ ৫টি KPI কার্ড দেখা
- **Method:** `GET`
- **URL:** `{{baseUrl}}/bookings/admin/all?page=1&limit=10&status=&search=&sortBy=createdAt&sortOrder=desc`
- **Auth Header:** `Authorization: Bearer {{adminToken}}`

- **Expected Response (200 OK):**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Admin bookings retrieved successfully!",
  "data": {
    "bookings": [
      {
        "_id": "6714cd012345678901234001",
        "bookingNumber": "BK-2611-ABCD",
        "customer": {
          "name": "Sarah Connor",
          "email": "sarah@example.com",
          "phone": "+61 400 123 456"
        },
        "artist": {
          "name": "Elena Rostova",
          "email": "elena@example.com"
        },
        "service": {
          "name": "Bridal Glam Makeup"
        },
        "category": "Bridal Makeup",
        "status": "confirmed",
        "paymentStatus": "Paid",
        "amount": 220
      }
    ],
    "stats": {
      "totalBookings": 128,
      "todayBookings": 6,
      "pending": 9,
      "completed": 104,
      "cancelled": 9
    },
    "meta": {
      "page": 1,
      "limit": 10,
      "total": 128,
      "totalPage": 13
    }
  }
}
```

---

### ধাপ ২: অ্যাডমিন - ড্যাশবোর্ড সাম্প্রতিক বুকিং উইজেট (Recent Bookings)
- **Method:** `GET`
- **URL:** `{{baseUrl}}/bookings/admin/recent?limit=6`
- **Auth Header:** `Authorization: Bearer {{adminToken}}`

- **Expected Response (200 OK):**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Recent bookings retrieved successfully!",
  "data": [
    {
      "id": "BK-2611-ABCD",
      "bookingId": "6714cd012345678901234001",
      "customer": { "name": "Sarah Connor" },
      "artist": { "name": "Elena Rostova" },
      "service": { "name": "Bridal Glam Makeup" },
      "amount": 220,
      "status": "confirmed",
      "paymentStatus": "Paid",
      "date": "Nov 25, 2026"
    }
  ]
}
```

---

### ধাপ ৩: অ্যাডমিন - পূর্ণাঙ্গ বুকিং ডিটেইলস লেআউট (Figma Admin/6.png)
*বুকিং আইডি `_id` অথবা বুকিং নম্বর `bookingNumber` (যেমন `BK-2611-ABCD`) পাস করা যায়।*

- **Method:** `GET`
- **URL:** `{{baseUrl}}/bookings/admin/{{bookingId}}`
- **Auth Header:** `Authorization: Bearer {{adminToken}}`

- **Expected Response (200 OK):**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Admin booking details retrieved successfully!",
  "data": {
    "bookingInformation": {
      "bookingId": "BK-2611-ABCD",
      "visitType": "Home Visit",
      "location": "Unit 4, 120 Collins Street, Melbourne",
      "travelFee": 20,
      "parkingFee": 0
    },
    "customerInformation": {
      "name": "Sarah Connor",
      "email": "sarah@example.com",
      "phone": "+61 400 123 456",
      "badge": "Customer"
    },
    "artistInformation": {
      "name": "Elena Rostova",
      "businessName": "Elena Rostova Bridal Artistry",
      "abn": "12 345 678 901",
      "isGstRegistered": true,
      "rating": 4.9,
      "reviewsCount": 38
    },
    "serviceDetails": {
      "name": "Bridal Glam Makeup",
      "category": "Bridal Makeup",
      "durationMinutes": 120,
      "price": 200
    },
    "paymentDetails": {
      "paymentMethod": "Stripe Card (Vaulted)",
      "totalBookingPrice": 220,
      "artistPayout": 160,
      "platformCommissionAmount": 40
    },
    "invoices": {
      "customerInvoicePdf": "https://pay.stripe.com/invoice/...",
      "artistInvoicePdf": "https://pay.stripe.com/invoice/..."
    },
    "internalNotes": "VIP client. Ensure extra time for consultation.",
    "timeline": [
      { "milestone": "booking_created", "status": "requested", "title": "Booking Created" },
      { "milestone": "artist_accepted", "status": "accepted", "title": "Artist Accepted" },
      { "milestone": "payment_completed", "status": "confirmed", "title": "Deposit Paid & Confirmed" }
    ]
  }
}
```

---

### ধাপ ৪: অ্যাডমিন - ক্রোনোলজিক্যাল বুকিং হিস্ট্রি টাইমলাইন দেখা
- **Method:** `GET`
- **URL:** `{{baseUrl}}/bookings/admin/{{bookingId}}/timeline`
- **Auth Header:** `Authorization: Bearer {{adminToken}}`

- **Expected Response (200 OK):**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Booking timeline retrieved successfully!",
  "data": {
    "bookingId": "{{bookingId}}",
    "bookingNumber": "BK-2611-ABCD",
    "currentStatus": "confirmed",
    "timeline": [
      {
        "milestone": "booking_created",
        "status": "requested",
        "title": "Booking Created",
        "actor": { "role": "customer", "name": "Sarah Connor" }
      },
      {
        "milestone": "artist_accepted",
        "status": "accepted",
        "title": "Artist Accepted",
        "actor": { "role": "artist", "name": "Elena Rostova" }
      }
    ]
  }
}
```

---

### ধাপ ৫: অ্যাডমিন - ইন্টারনাল নোট সেভ বা আপডেট করা
- **Method:** `PATCH`
- **URL:** `{{baseUrl}}/bookings/admin/{{bookingId}}/notes`
- **Auth Header:** `Authorization: Bearer {{adminToken}}`
- **Body:**
```json
{
  "adminNotes": "VIP customer. Client requested artist to bring cruelty-free makeup kit."
}
```

- **Expected Response (200 OK):**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Admin booking notes updated successfully!",
  "data": {
    "_id": "{{bookingId}}",
    "bookingNumber": "BK-2611-ABCD",
    "adminNotes": "VIP customer. Client requested artist to bring cruelty-free makeup kit."
  }
}
```

🎉 **ফ্লো ০৭ সফলভাবে সম্পন্ন!**
