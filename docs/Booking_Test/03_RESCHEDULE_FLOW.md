# Flow 03: Appointment Reschedule Flow

> **উদ্দেশ্য:** একটি কনফার্মড বুকিংয়ের সময় পরিবর্তনের আবেদন করা (কাস্টমার বা আর্টিস্ট) ➔ অপর পক্ষ আবেদনটি গ্রহণ করা বা প্রত্যাখান করা ➔ গ্রহণ করলে বুকিংয়ের সময় ও তারিখ স্বয়ংক্রিয়ভাবে আপডেট হওয়া।

---

## 🔑 পূর্বশর্ত (Pre-conditions):
- একটি সক্রিয় ও কনফার্মড বুকিং আইডি (`{{bookingId}}`) থাকতে হবে।

---

## 🏃‍♂️ ধাপসমূহ (Step-by-Step Execution):

### ধাপ ১: রিশিডিউলের আবেদন পাঠানো (Request Reschedule)
*কাস্টমার নতুন কোনো তারিখ ও সময়ের প্রস্তাব পাঠাবে।*

- **Method:** `POST`
- **URL:** `{{baseUrl}}/bookings/{{bookingId}}/reschedule-request`
- **Auth Header:** `Authorization: Bearer {{customerToken}}`
- **Body:**
```json
{
  "proposedDate": "2026-11-30",
  "proposedStartTime": "03:30 PM",
  "reason": "Flight arrived late, need to shift appointment by 2 days."
}
```

- **Expected Response (200 OK):**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Reschedule request submitted successfully! Awaiting other party response.",
  "data": {
    "_id": "{{bookingId}}",
    "rescheduleRequest": {
      "proposedDate": "2026-11-30T00:00:00.000Z",
      "proposedStartTime": "15:30",
      "requestedBy": "customer",
      "reason": "Flight arrived late, need to shift appointment by 2 days.",
      "isPending": true
    }
  }
}
```

---

### ধাপ ২: অপর পক্ষ রিশিডিউল অনুমোদন করা (Accept Reschedule)
*আর্টিস্ট আবেদনটি গ্রহণ করবে।*

- **Method:** `POST`
- **URL:** `{{baseUrl}}/bookings/{{bookingId}}/reschedule-respond`
- **Auth Header:** `Authorization: Bearer {{artistToken}}`
- **Body:**
```json
{
  "accepted": true
}
```

- **Expected Response (200 OK):**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Reschedule request accepted. Appointment schedule updated.",
  "data": {
    "_id": "{{bookingId}}",
    "bookingDate": "2026-11-30T00:00:00.000Z",
    "startTime": "15:30",
    "rescheduleRequest": {
      "isPending": false,
      "isAccepted": true
    }
  }
}
```

---

### ধাপ ৩: টাইমলাইনে রিশিডিউল ইভেন্ট চেক করা
- **Method:** `GET`
- **URL:** `{{baseUrl}}/bookings/{{bookingId}}/timeline`
- **Auth Header:** `Authorization: Bearer {{customerToken}}`
- **Expected Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "timeline": [
      {
        "milestone": "rescheduled",
        "title": "Appointment Rescheduled",
        "description": "Appointment date changed to 2026-11-30 15:30"
      }
    ]
  }
}
```

🎉 **ফ্লো ০৩ সফলভাবে সম্পন্ন!**
