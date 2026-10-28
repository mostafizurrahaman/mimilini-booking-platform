# Flow 06: Customer No-Show & Safety Incident Reporting Flow

> **উদ্দেশ্য:** আর্টিস্ট কাস্টমারের ঠিকানায় উপস্থিত হয়ে ২৫+ মিনিট অপেক্ষা করার পরও কাস্টমার না আসলে বা কোনো সেফটি থ্রেট থাকলে আর্টিস্ট নো-শো রিপোর্ট করবে ➔ অ্যাডমিন রিভিউ করে ক্লেইমটি অ্যাপ্রুভ করবে এবং আর্টিস্টের ১০০% নেট পেআউট রিলিজ করে দেবে।

---

## 🏃‍♂️ ধাপসমূহ (Step-by-Step Execution):

### ধাপ ১: আর্টিস্ট কাস্টমার নো-শো রিপোর্ট করা (Report No-Show)
*আর্টিস্ট রিপোর্ট সাবমিট করবে।*

- **Method:** `POST`
- **URL:** `{{baseUrl}}/bookings/{{bookingId}}/report-no-show`
- **Auth Header:** `Authorization: Bearer {{artistToken}}`
- **Body:**
```json
{
  "reason": "Arrived at location at 09:55 AM. Waited until 10:25 AM. Customer did not answer phone or open door.",
  "isSafetyConcern": false
}
```

- **Expected Response (200 OK):**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Customer no-show reported successfully. Admin verification is required before releasing the payout.",
  "data": {
    "_id": "{{bookingId}}",
    "status": "customer_no_show_pending_verification",
    "noShowDetails": {
      "reason": "Arrived at location at 09:55 AM. Waited until 10:25 AM. Customer did not answer phone or open door.",
      "isApproved": false
    }
  }
}
```

---

### ধাপ ২: অ্যাডমিন নো-শো ভেরিফাই ও পেআউট রিলিজ করা (Admin Verifies No-Show)
*অ্যাডমিন আর্টিস্টের জিপিএস লোকেশন ও কল লগ যাচাই করে পেআউট রিলিজ করে দেবে।*

- **Method:** `POST`
- **URL:** `{{baseUrl}}/bookings/{{bookingId}}/verify-no-show`
- **Auth Header:** `Authorization: Bearer {{adminToken}}`
- **Body:**
```json
{
  "isApproved": true,
  "adminNotes": "Verified phone call logs and artist location GPS. 100% artist payout released."
}
```

- **Expected Response (200 OK):**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Customer no-show verified and approved. Full payout has been released to the artist.",
  "data": {
    "_id": "{{bookingId}}",
    "status": "customer_no_show",
    "noShowDetails": {
      "isApproved": true,
      "adminNotes": "Verified phone call logs and artist location GPS. 100% artist payout released."
    }
  }
}
```

🎉 **ফ্লো ০৬ সফলভাবে সম্পন্ন!**
