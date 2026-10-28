# Flow 05: Cancellations, Wallet Credits & Artist Penalty Flow

> **উদ্দেশ্য:** বুকিং বাতিলের পলিসি টেস্ট করা:
> 1. কাস্টমার ২৪ ঘণ্টার পূর্বে বাতিল করলে (`>24h`) ➔ ২০% ডিপোজিট ৩৬ মাসের প্ল্যাটফর্ম ওয়ালেট ক্রেডিট হিসেবে ফেরত পাওয়া।
> 2. কাস্টমার ২৪ ঘণ্টার মধ্যে বাতিল করলে (`<24h`) ➔ ২০% ডিপোজিট বাজেয়াপ্ত (Forfeited) হওয়া।
> 3. আর্টিস্ট বাতিল করলে ➔ কাস্টমার ১০০% রিফান্ড পাওয়া + আর্টিস্ট প্রোফাইলে পেনাল্টি চার্জ ও সাসপেনশন লাগা।

---

## 🏃‍♂️ ধাপসমূহ (Step-by-Step Execution):

### দৃশ্যপট ১: কাস্টমার ক্যান্সেলেশন (>২৪ ঘণ্টা আগে বাতিল)
*কনফার্মড বুকিং অ্যাপয়েন্টমেন্টের ২৪ ঘণ্টার বেশি সময় থাকতে কাস্টমার বাতিল করবে।*

- **Method:** `POST`
- **URL:** `{{baseUrl}}/bookings/{{bookingId}}/customer-cancel`
- **Auth Header:** `Authorization: Bearer {{customerToken}}`
- **Body:**
```json
{
  "reason": "Change of plans, event delayed."
}
```

- **Expected Response (200 OK):**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Booking cancelled successfully. Deposit refunded as Platform Credit (valid 36 months).",
  "data": {
    "status": "cancelled",
    "cancelledByRole": "customer",
    "platformCreditIssued": 44
  }
}
```

---

### দৃশ্যপট ২: আর্টিস্ট ক্যান্সেলেশন (Artist Cancels & Penalty Incurred)
*আর্টিস্ট কনফার্মড বুকিং বাতিল করলে কাস্টমার ১০০% রিফান্ড পায় এবং আর্টিস্ট প্রোফাইল সাময়িকভাবে পেনাল্টি ব্লকে পড়ে।*

- **Method:** `POST`
- **URL:** `{{baseUrl}}/bookings/{{bookingId}}/artist-cancel`
- **Auth Header:** `Authorization: Bearer {{artistToken}}`
- **Body:**
```json
{
  "reason": "Emergency personal issue."
}
```

- **Expected Response (200 OK):**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Booking cancelled. Customer refunded. Artist cancellation policy applied.",
  "data": {
    "status": "cancelled",
    "cancelledByRole": "artist"
  }
}
```

---

### দৃশ্যপট ৩: সাধারণ বুকিং ক্যান্সেলেশন (Generic Cancel)
- **Method:** `POST`
- **URL:** `{{baseUrl}}/bookings/{{bookingId}}/cancel`
- **Auth Header:** `Authorization: Bearer {{customerToken}}`
- **Body:**
```json
{
  "reason": "Mutual agreement to cancel."
}
```

- **Expected Response (200 OK):**
```json
{
  "success": true,
  "statusCode": 200,
  "data": {
    "status": "cancelled"
  }
}
```

🎉 **ফ্লো ০৫ সফলভাবে সম্পন্ন!**
