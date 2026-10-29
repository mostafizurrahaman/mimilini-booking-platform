# বুকিং এপিআই টেস্টিং ও স্ট্যাটাস ভেরিফিকেশন গাইড (বাংলা)

এই গাইডে মিমিলিনির (Mimilini) সমস্ত **১০টি বুকিং স্ট্যাটাস** এবং ব্যবসায়িক নিয়মাবলীর (Business Rules) এন্ড-টু-এন্ড টেস্টিং ফ্লো বিস্তারিতভাবে তুলে ধরা হলো।

---

## দ্রুত রেফারেন্স: ১০টি কোর স্ট্যাটাস ও ট্রানজিশন

| স্ট্যাটাস (`status`) | যে এপিআই বা অ্যাকশনে এই স্ট্যাটাস হয় | এর পরবর্তী সম্ভাব্য অবস্থা |
| :--- | :--- | :--- |
| **`requested`** | `POST /api/v1/booking` (ম্যানুয়াল বা সাধারণ বুকিংয়ে) | `accepted`, `declined`, `cancelled` |
| **`accepted`** | `PATCH /api/v1/booking/:id/accept` (আর্টিস্ট গ্রহণ করলে) | `confirmed`, `cancelled` |
| **`confirmed`** | `POST /api/v1/booking/:id/confirm-payment` (২০% পে করলে) অথবা কুইক বুকিং | `in_progress`, `completed`, `rescheduled`, `cancelled`, `no_show_pending` |
| **`in_progress`** | আর্টিস্ট কাজ শুরু করলে | `completed`, `no_show_pending`, `cancelled` |
| **`completed`** | `POST /api/v1/booking/:id/complete` (প্রুফ ফটো ও সাইন দিলে) | সমাপ্ত (Terminal) |
| **`cancelled`** | `POST /api/v1/booking/:id/cancel` অথবা ২ ঘণ্টার ক্রন জব | সমাপ্ত (Terminal) |
| **`declined`** | `PATCH /api/v1/booking/:id/decline` (আর্টিস্ট নাকচ করলে) | সমাপ্ত (Terminal) |
| **`rescheduled`** | `POST /api/v1/booking/:id/reschedule-respond` (`accept`) | `in_progress`, `completed`, `cancelled` |
| **`no_show_pending`**| `POST /api/v1/booking/:id/report-no-show` (আর্টিস্ট নো-শো দিলে) | `no_show` (অনুমোদন) অথবা `confirmed` (বাতিল) |
| **`no_show`** | `POST /api/v1/booking/:id/verify-no-show` (`isApproved: true`) | সমাপ্ত (Terminal - পেআউট রিলিজড) |

---

## টেস্টিং শুরুর প্রস্তুতি (Postman / Client Setup)

আপনার Postman এনভায়রনমেন্টে নিচের ভেরিয়েবলগুলো সেট করুন:
- `baseUrl`: `http://localhost:5000`
- `customerToken`: কাস্টমারের Bearer JWT টোকেন (`role: "customer"`)
- `artistToken`: আর্টিস্টের Bearer JWT টোকেন (`role: "artist"`)
- `adminToken`: অ্যাডমিনের Bearer JWT টোকেন (`role: "admin"`)
- `paymentMethodId`: কাস্টমারের সেভ করা কার্ড আইডি (যেমন: `pm_card_visa`)

---

## সিনারিও ১: সাধারণ সফল বুকিং ফ্লো (`requested` $\rightarrow$ `accepted` $\rightarrow$ `confirmed` $\rightarrow$ `completed`)

### ধাপ ১.১: চেকআউট প্রিভিউ দেখা
*কাস্টমার সার্ভিস নেওয়ার আগে প্রাইস ও ফি হিসাব দেখবে।*
- **মেথড:** `POST`
- **ইউআরএল:** `{{baseUrl}}/api/v1/booking/preview`
- **হেডার:** `Authorization: Bearer {{customerToken}}`
- **বডি (JSON):**
```json
{
  "artist": "67b000000000000000000001",
  "service": "67b000000000000000000002",
  "bookingDate": "2026-11-15",
  "startTime": "10:00",
  "visitType": "salon_visit",
  "usePlatformCredit": false
}
```
- **প্রত্যাশিত স্ট্যাটাস কোড:** `200 OK`
- **প্রত্যাশিত আউটপুট:** `servicePrice`, `depositAmount` (২০%), `balanceAmount` (৮০%), `platformCommissionAmount`, `artistNetPayout` সহ পূর্ণাঙ্গ ফিনান্সিয়াল ব্রেকডাউন।

### ধাপ ১.২: কাস্টমার বুকিং রিকোয়েস্ট তৈরি করা
- **মেথড:** `POST`
- **ইউআরএল:** `{{baseUrl}}/api/v1/booking`
- **হেডার:** `Authorization: Bearer {{customerToken}}`
- **বডি (JSON):**
```json
{
  "artist": "67b000000000000000000001",
  "service": "67b000000000000000000002",
  "bookingDate": "2026-11-15",
  "startTime": "10:00",
  "visitType": "salon_visit"
}
```
- **প্রত্যাশিত স্ট্যাটাস কোড:** `201 Created`
- **ডাটাবেজ ভেরিফিকেশন:**
  - `booking.status`: `"requested"`
  - `booking.initialPayment.status`: `"pending"`
  - `booking.balancePayment.status`: `"pending"`

### ধাপ ১.৩: আর্টিস্ট রিকোয়েস্ট গ্রহণ (Accept) করা
- **মেথড:** `PATCH`
- **ইউআরএল:** `{{baseUrl}}/api/v1/booking/{{bookingId}}/accept`
- **হেডার:** `Authorization: Bearer {{artistToken}}`
- **প্রত্যাশিত স্ট্যাটাস কোড:** `200 OK`
- **ডাটাবেজ ভেরিফিকেশন:**
  - `booking.status`: `"accepted"`

### ধাপ ১.৪: কাস্টমার ২০% ডিপোজিট পেমেন্ট করে কনফার্ম করা
- **মেথড:** `POST`
- **ইউআরএল:** `{{baseUrl}}/api/v1/booking/{{bookingId}}/confirm-payment`
- **হেডার:** `Authorization: Bearer {{customerToken}}`
- **বডি (JSON):**
```json
{
  "paymentMethodId": "{{paymentMethodId}}",
  "usePlatformCredit": false
}
```
- **প্রত্যাশিত স্ট্যাটাস কোড:** `200 OK`
- **ডাটাবেজ ভেরিফিকেশন:**
  - `booking.status`: `"confirmed"`
  - `booking.initialPayment.status`: `"captured"`
  - `booking.initialPayment.paidAt`: বর্তমান সময়
  - `booking.stripeInvoiceId`: Stripe-এ কাস্টমারের ট্যাক্স ইনভয়েস তৈরি হবে

### ধাপ ১.৫: অ্যাপয়েন্টমেন্টের ২৪ ঘণ্টা পূর্বে বাকি ৮০% ব্যালেন্স অটো-চার্জ হওয়া
*(স্বয়ংক্রিয়ভাবে ব্যাকগ্রাউন্ড ক্রন জব কাটে, অথবা কাস্টমার নিজে আগে পে করতে পারে)*
- **ম্যানুয়াল টেস্ট মেথড:** `POST`
- **ইউআরএল:** `{{baseUrl}}/api/v1/booking/{{bookingId}}/pay-balance`
- **হেডার:** `Authorization: Bearer {{customerToken}}`
- **বডি (JSON):**
```json
{
  "paymentMethodId": "{{paymentMethodId}}"
}
```
- **প্রত্যাশিত স্ট্যাটাস কোড:** `200 OK`
- **ডাটাবেজ ভেরিফিকেশন:**
  - `booking.status`: `"confirmed"` (বুকিং কনফার্মড থাকবে)
  - `booking.balancePayment.status`: `"captured"`
  - `booking.balancePayment.paidAt`: বর্তমান সময়
  - আর্টিস্টের নামে অফিসিয়াল RCTI ইনভয়েস ইস্যু হবে

### ধাপ ১.৬: আর্টিস্ট সার্ভিস সম্পূর্ণ করা
- **মেথড:** `POST` (Form-data)
- **ইউআরএল:** `{{baseUrl}}/api/v1/booking/{{bookingId}}/complete`
- **হেডার:** `Authorization: Bearer {{artistToken}}`
- **ফর্ম ডাটা:**
  - `data`: `{"servicesPerformed":"Hair Styling & Makeup","productsUsed":"MAC Foundation","totalWorkingTime":"60 mins","specialNotes":"Customer was very satisfied"}`
  - `proofPhotos`: [১-২টি টেস্ট ইমেজ সিলেক্ট করুন]
- **প্রত্যাশিত স্ট্যাটাস কোড:** `200 OK`
- **ডাটাবেজ ভেরিফিকেশন:**
  - `booking.status`: `"completed"`
  - `booking.completionDetails.proofPhotos`: S3 ইমেজ ইউআরএল থাকবে
  - `booking.completionDetails.completedAt`: বর্তমান সময়

---

## সিনারিও ২: কুইক বুকিং ফ্লো (সরাসরি `confirmed`)

### ধাপ ২.১: কুইক বুকিং সক্রিয় থাকা আর্টিস্টকে বুক করা
*আর্টিস্টের অ্যাকসেপ্ট করার অপেক্ষা না করে সরাসরি ২০% ডিপোজিট কেটে কনফার্ম হবে।*
- **মেথড:** `POST`
- **ইউআরএল:** `{{baseUrl}}/api/v1/booking`
- **হেডার:** `Authorization: Bearer {{customerToken}}`
- **বডি (JSON):**
```json
{
  "artist": "67b000000000000000000001",
  "service": "67b000000000000000000002",
  "bookingDate": "2026-11-20",
  "startTime": "14:00",
  "visitType": "salon_visit",
  "paymentMethodId": "{{paymentMethodId}}"
}
```
- **প্রত্যাশিত স্ট্যাটাস কোড:** `201 Created`
- **ডাটাবেজ ভেরিফিকেশন:**
  - `booking.status`: `"confirmed"`
  - `booking.isQuickBooking`: `true`
  - `booking.initialPayment.status`: `"captured"`

---

## সিনারিও ৩: আর্টিস্ট রিকোয়েস্ট রিজেক্ট করা (`requested` $\rightarrow$ `declined`)

### ধাপ ৩.১: আর্টিস্ট প্রাথমিক রিকোয়েস্ট ডিক্লাইন করা
- **মেথড:** `PATCH`
- **ইউআরএল:** `{{baseUrl}}/api/v1/booking/{{bookingId}}/decline`
- **হেডার:** `Authorization: Bearer {{artistToken}}`
- **বডি (JSON):**
```json
{
  "reason": "এই সময়ে আমার অন্য ব্যক্তিগত ব্যস্ততা রয়েছে"
}
```
- **প্রত্যাশিত স্ট্যাটাস কোড:** `200 OK`
- **ডাটাবেজ ভেরিফিকেশন:**
  - `booking.status`: `"declined"`
  - `booking.cancelledByRole`: `"artist"`
  - `booking.cancellationReason`: `"এই সময়ে আমার অন্য ব্যক্তিগত ব্যস্ততা রয়েছে"`

---

## সিনারিও ৪: তারিখ/সময় পরিবর্তন ফ্লো (`confirmed` $\rightarrow$ `rescheduled`)

### ধাপ ৪.১: রিস্কেডিউল রিকোয়েস্ট পাঠানো
- **মেথড:** `POST`
- **ইউআরএল:** `{{baseUrl}}/api/v1/booking/{{bookingId}}/reschedule-request`
- **হেডার:** `Authorization: Bearer {{customerToken}}`
- **বডি (JSON):**
```json
{
  "newDate": "2026-11-22",
  "newStartTime": "15:00",
  "reason": "জরুরি কাজের জন্য ২ দিন পেছাতে চাই"
}
```
- **প্রত্যাশিত স্ট্যাটাস কোড:** `200 OK`
- **ডাটাবেজ ভেরিফিকেশন:**
  - `booking.rescheduleHistory`-তে নতুন পেন্ডিং রেকর্ড যুক্ত হবে

### ধাপ ৪.২: অপর পক্ষ রিকোয়েস্ট অ্যাকসেপ্ট করা
- **মেথড:** `POST`
- **ইউআরএল:** `{{baseUrl}}/api/v1/booking/{{bookingId}}/reschedule-respond`
- **হেডার:** `Authorization: Bearer {{artistToken}}`
- **বডি (JSON):**
```json
{
  "action": "accept"
}
```
- **প্রত্যাশিত স্ট্যাটাস কোড:** `200 OK`
- **ডাটাবেজ ভেরিফিকেশন:**
  - `booking.status`: `"rescheduled"`
  - `booking.bookingDate`: `"2026-11-22T00:00:00.000Z"`
  - `booking.startTime`: `"15:00"`

---

## সিনারিও ৫: কাস্টমার ২৪ ঘণ্টার বেশি পূর্বে বাতিল করা (> 24h) (`status: cancelled`)

*পলিসি: ২০% ডিপোজিট থেকে কেবল Stripe ফি কেটে বাকি পুরো টাকা কাস্টমারের ওয়ালেটে Platform Credit হিসেবে রিফান্ড হবে।*

### ধাপ ৫.১: কাস্টমার বাতিল করা (>২৪ ঘণ্টা আগে)
- **মেথড:** `POST`
- **ইউআরএল:** `{{baseUrl}}/api/v1/booking/{{bookingId}}/cancel`
- **হেডার:** `Authorization: Bearer {{customerToken}}`
- **বডি (JSON):**
```json
{
  "cancellationReason": "প্ল্যান পরিবর্তন হয়েছে"
}
```
- **প্রত্যাশিত স্ট্যাটাস কোড:** `200 OK`
- **মেসেজ:** ২০% ডিপোজিট থেকে Stripe ফি বাদ দিয়ে বাকি অর্থ প্ল্যাটফর্ম ক্রেডিট হিসেবে রিফান্ডের বিবরণ থাকবে।
- **ডাটাবেজ ভেরিফিকেশন:**
  - `booking.status`: `"cancelled"`
  - `booking.cancelledByRole`: `"customer"`
  - `booking.platformCreditIssued`: ২০% ডিপোজিট মাইনাস স্ট্রাইপ ফি এর সমান
  - `booking.initialPayment.status`: `"refunded"`
  - `Wallet`: কাস্টমারের ব্যালেন্স উক্ত পরিমাণ ক্রেডিট দিয়ে বাড়বে
  - `WalletLedger`: `source: "cancellation_credit"` রেকর্ড তৈরি হবে

---

## সিনারিও ৬: কাস্টমার ২৪ ঘণ্টার মধ্যে বাতিল করা (< 24h) এবং ৮০% আগেই দেওয়া থাকলে

*পলিসি: প্ল্যাটফর্ম রাখবে মূল ২০% ডিপোজিট। কাস্টমার পাবে আর্টিস্ট নেট ব্যালেন্সের ৪০% প্ল্যাটফর্ম ক্রেডিট। আর্টিস্ট পাবে আর্টিস্ট নেট ব্যালেন্সের ৪০% সরাসরি Stripe Connected একাউন্টে।*

### ধাপ ৬.১: কাস্টমার বাতিল করা (<২৪ ঘণ্টা সময়ে)
- **মেথড:** `POST`
- **ইউআরএল:** `{{baseUrl}}/api/v1/booking/{{bookingId}}/cancel`
- **হেডার:** `Authorization: Bearer {{customerToken}}`
- **বডি (JSON):**
```json
{
  "cancellationReason": "আজকে সময় দেওয়া সম্ভব হচ্ছে না"
}
```
- **প্রত্যাশিত স্ট্যাটাস কোড:** `200 OK`
- **ডাটাবেজ ভেরিফিকেশন:**
  - `booking.status`: `"cancelled"`
  - `booking.cancelledByRole`: `"customer"`
  - `booking.platformCreditIssued`: `round2(artistNetPayout * 0.4)`
  - কাস্টমারের ওয়ালেটে ৪০% ক্রেডিট জমা হবে
  - আর্টিস্টের Stripe অ্যাকাউন্টে ৪০% টাকা ট্রান্সফার হবে
  - `PaymentTransaction`: `type: "CANCELLATION_FEE"` রেকর্ড তৈরি হবে

---

## সিনারিও ৭: কাস্টমার ২৪ ঘণ্টার মধ্যে বাতিল করা (< 24h) কিন্তু ৮০% না দেওয়া থাকলে

*পলিসি: কাস্টমারের দেওয়া মূল ২০% ডিপোজিট বাজেয়াপ্ত হবে।*

### ধাপ ৭.১: কাস্টমার বাতিল করা
- **মেথড:** `POST`
- **ইউআরএল:** `{{baseUrl}}/api/v1/booking/{{bookingId}}/cancel`
- **হেডার:** `Authorization: Bearer {{customerToken}}`
- **বডি (JSON):**
```json
{
  "cancellationReason": "লাস্ট মোমেন্ট বাতিল"
}
```
- **প্রত্যাশিত স্ট্যাটাস কোড:** `200 OK`
- **ডাটাবেজ ভেরিফিকেশন:**
  - `booking.status`: `"cancelled"`
  - `booking.cancelledByRole`: `"customer"`
  - `booking.depositForfeited`: `true`
  - `booking.platformCreditIssued`: `0`

---

## সিনারিও ৮: ৮০% ব্যালেন্স পেমেন্ট ফেইল ও ২ ঘণ্টার গ্রেস পিরিয়ড শেষ হওয়া

*পলিসি: ২৪h আগে অটো-চার্জ ফেইল হলে ২ ঘণ্টার গ্রেস পিরিয়ড পাবে। পে না করলে ক্রন জব বুকিং বাতিল করে ২০% ডিপোজিট (স্ট্রাইপ ফি বাদে) রিফান্ড দিয়ে স্লট রিলিজ করবে।*

### ধাপ ৮.১: ব্যাকগ্রাউন্ড ক্রন জবে কার্ড ফেইল হওয়া
- ক্রন জব ডাটাবেজে মার্ক করবে:
  - `booking.balancePayment.status`: `"failed"`
  - `booking.balancePayment.rectificationDeadline`: বর্তমান সময় + ২ ঘণ্টা

### ধাপ ৮.২: ২ ঘণ্টা অতিবাহিত হওয়া (ক্রন জব এক্সিকিউশন)
- `processExpiredRectificationCancellations` ক্রন জব স্বয়ংক্রিয়ভাবে বুকিং বাতিল করবে।
- **ডাটাবেজ ভেরিফিকেশন:**
  - `booking.status`: `"cancelled"`
  - `booking.cancelledByRole`: `"system"`
  - `booking.cancellationReason`: `"Non-payment of remaining 80% balance within 2-hour rectification window"`
  - `booking.platformCreditIssued`: ডিপোজিট মাইনাস স্ট্রাইপ ফি
  - `booking.initialPayment.status`: `"refunded"`
  - কাস্টমারের ওয়ালেট রিফান্ড ক্রেডিট দিয়ে রিচার্জ হবে

---

## সিনারিও ৯: আর্টিস্ট ৪৮ ঘণ্টার মধ্যে বাতিল করা (< 48h) (হার্ড-ব্লক / সাসপেনশন)

*পলিসি: কাস্টমার ১০০% রিফান্ড প্ল্যাটফর্ম ক্রেডিট পাবে + বিকল্প আর্টিস্টের লিস্ট পাবে। আর্টিস্ট তাৎক্ষণিক SUSPENDED (জরিমানা না দেওয়া পর্যন্ত সকল এপিআই ব্লক)।*

### ধাপ ৯.১: আর্টিস্ট বাতিল করা (<৪৮ ঘণ্টা সময়ে)
- **মেথড:** `POST`
- **ইউআরএল:** `{{baseUrl}}/api/v1/booking/{{bookingId}}/cancel`
- **হেডার:** `Authorization: Bearer {{artistToken}}`
- **বডি (JSON):**
```json
{
  "cancellationReason": "যন্ত্রপাতি নষ্ট হয়ে গেছে"
}
```
- **প্রত্যাশিত স্ট্যাটাস কোড:** `200 OK`
- **প্রত্যাশিত রেসপন্স বডি:**
  - `message`: অ্যাকাউন্ট **SUSPENDED** হওয়ার ওয়ার্নিং ও জরিমানার পরিমাণ উল্লেখ থাকবে।
  - `nearbyAlternativeArtists`: কাছাকাছি অন্য সক্রিয় আর্টিস্টদের তালিকা থাকবে (সর্বোচ্চ ৬ জন)।
- **ডাটাবেজ ভেরিফিকেশন:**
  - `booking.status`: `"cancelled"`
  - `booking.cancelledByRole`: `"artist"`
  - `booking.platformCreditIssued`: কাস্টমারের প্রদত্ত সমুদয় অর্থ (১০০%)
  - `User.authStatus`: `"suspended"`
  - `ArtistProfile.isSearchVisible`: `false`
  - `ArtistProfile.activePenaltyAmount`: নির্ধারিত পেনাল্টি অ্যামাউন্ট
  - `PaymentTransaction`: `type: "PENALTY"` রেকর্ড তৈরি হবে

### ধাপ ৯.২: সাসপেন্ডেড অবস্থায় আর্টিস্টের অন্য এপিআই ব্লক হওয়া চেক করা
- **মেথড:** `GET`
- **ইউআরএল:** `{{baseUrl}}/api/v1/booking/my-bookings`
- **হেডার:** `Authorization: Bearer {{artistToken}}`
- **প্রত্যাশিত স্ট্যাটাস কোড:** `403 Forbidden`
- **মেসেজ:** অ্যাকাউন্ট সাসপেন্ডেড এবং জরিমানা পরিশোধের নির্দেশ থাকবে।

### ধাপ ৯.৩: আর্টিস্ট পেনাল্টি পে করে রিঅ্যাক্টিভেট হওয়া
- **মেথড:** `POST`
- **ইউআরএল:** `{{baseUrl}}/api/v1/penalty/create-checkout-session`
- **হেডার:** `Authorization: Bearer {{artistToken}}`
- **প্রত্যাশিত স্ট্যাটাস কোড:** `200 OK`
- **প্রত্যাশিত আউটপুট:** Stripe Checkout URL পাবে। পেমেন্ট সম্পন্ন হলে Webhook স্বয়ংক্রিয়ভাবে `authStatus: "active"` করে দেবে।

---

## সিনারিও ১০: আর্টিস্ট ৪৮ ঘণ্টার পূর্বে বাতিল করা (> 48h) (সফট-ব্লক)

*পলিসি: কাস্টমার ১০০% ক্রেডিট পাবে। আর্টিস্ট সাসপেন্ড হবে না, তবে জরিমানা জারি হবে এবং পে না করা পর্যন্ত প্রোফাইল সার্চে হাইড থাকবে।*

### ধাপ ১০.১: আর্টিস্ট বাতিল করা (>৪৮ ঘণ্টা আগে)
- **মেথড:** `POST`
- **ইউআরএল:** `{{baseUrl}}/api/v1/booking/{{bookingId}}/cancel`
- **হেডার:** `Authorization: Bearer {{artistToken}}`
- **বডি (JSON):**
```json
{
  "cancellationReason": "পারিবারিক কাজের জন্য যেতে পারছি না"
}
```
- **প্রত্যাশিত স্ট্যাটাস কোড:** `200 OK`
- **ডাটাবেজ ভেরিফিকেশন:**
  - `booking.status`: `"cancelled"`
  - `User.authStatus`: `"active"` (আর্টিস্ট সাসপেন্ড হবে না)
  - `ArtistProfile.isSearchVisible`: `false` (জরিমানা না দেওয়া পর্যন্ত সার্চে গোপন থাকবে)
  - `ArtistProfile.activePenaltyAmount`: বাজেট ও সময় অনুযায়ী জরিমানার টাকা

---

## সিনারিও ১১: কাস্টমার No-Show / সেফটি রিফিউজাল (`no_show_pending` $\rightarrow$ `no_show`)

*পলিসি: আর্টিস্ট নো-শো রিপোর্ট করলে অ্যাডমিনের কাছে ভেরিফিকেশনে যাবে। অ্যাডমিন অ্যাপ্রুভ করলে আর্টিস্ট ১০০% প্রোটেক্টেড পেআউট পেয়ে যাবে।*

### ধাপ ১১.১: আর্টিস্ট কাস্টমার নো-শো রিপোর্ট করা
- **মেথড:** `POST`
- **ইউআরএল:** `{{baseUrl}}/api/v1/booking/{{bookingId}}/report-no-show`
- **হেডার:** `Authorization: Bearer {{artistToken}}`
- **বডি (JSON):**
```json
{
  "reason": "২০ মিনিট অপেক্ষার পরেও কাস্টমার দরজা খোলেনি এবং ফোনে পাওয়া যায়নি",
  "isSafetyConcern": false
}
```
- **প্রত্যাশিত স্ট্যাটাস কোড:** `200 OK`
- **ডাটাবেজ ভেরিফিকেশন:**
  - `booking.status`: `"no_show_pending"`
  - `booking.noShowDetails.reportedBy`: আর্টিস্টের আইডি
  - `booking.noShowDetails.isApproved`: `false`
  - যদি ৮০% ব্যালেন্স এখনও পেন্ডিং থাকে, কার্ড থেকে কাটার চেষ্টা করা হবে

### ধাপ ১১.২: অ্যাডমিন নো-শো ক্লেইম অনুমোদন (Approve) করা
- **মেথড:** `POST`
- **ইউআরএল:** `{{baseUrl}}/api/v1/booking/{{bookingId}}/verify-no-show`
- **হেডার:** `Authorization: Bearer {{adminToken}}`
- **বডি (JSON):**
```json
{
  "isApproved": true,
  "adminNotes": "জিপিএস এবং কল লগ যাচাই করে অনুমোদন করা হলো"
}
```
- **প্রত্যাশিত স্ট্যাটাস কোড:** `200 OK`
- **ডাটাবেজ ভেরিফিকেশন:**
  - `booking.status`: `"no_show"`
  - `booking.noShowDetails.isApproved`: `true`
  - `booking.noShowDetails.verifiedBy`: অ্যাডমিন আইডি
  - আর্টিস্টের Stripe Connected অ্যাকাউন্টে ১০০% প্রোটেক্টেড পেআউট ট্রান্সফার হবে
  - `PaymentTransaction`: `type: "FULL_100"` সাকসেস রেকর্ড তৈরি হবে

### ধাপ ১১.৩ (বিকল্প): অ্যাডমিন নো-শো রিজেক্ট করলে
- **বডি (JSON):** `{"isApproved": false, "adminNotes": "কাস্টমার যথাসময়েই উপস্থিত হয়েছিল"}`
- **ডাটাবেজ ভেরিফিকেশন:**
  - `booking.status`: আবার `"confirmed"` অবস্থায় ফিরে যাবে

---

## সিনারিও ১২: স্ট্যাটাস ফিল্টারিং ও ট্যাব কুয়েরি ভেরিফিকেশন

`GET /api/v1/booking/my-bookings` এপিআই-এর ট্যাব ফিল্টারগুলো যাচাই করুন:

| ট্যাবের নাম (`tab`) | যে যে স্ট্যাটাসের বুকিং রিটার্ন করবে |
| :--- | :--- |
| `?tab=upcoming` | `confirmed`, `in_progress`, `rescheduled` |
| `?tab=pending` | `requested`, `accepted` |
| `?tab=new_requests`| `requested` |
| `?tab=completed` | `completed` |
| `?tab=cancelled` | `cancelled`, `declined`, `no_show` |
| নির্দিষ্ট স্ট্যাটাস ফিল্টার | `?status=no_show_pending` |
