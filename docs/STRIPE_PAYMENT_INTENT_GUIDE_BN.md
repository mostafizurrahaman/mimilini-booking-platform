# 💳 স্ট্রাইপ পেমেন্ট ইনটেন্ট (PaymentIntent) গাইডলাইন: কার্ড, Apple Pay ও Google Pay

এই ডকুমেন্টে একদম সহজ বাংলায় ব্যাখ্যা করা হয়েছে কিভাবে **Credit/Debit Card**, **Apple Pay**, এবং **Google Pay** দিয়ে আমাদের প্ল্যাটফর্মের **২০% অগ্রিম ডিপোজিট** এবং **২৪ ঘণ্টা আগের ৮০% ব্যালেন্স পেমেন্ট** সম্পন্ন হবে।

---

## ১. কার্ড, Apple Pay ও Google Pay কি আলাদাভাবে কোড করতে হবে?

**উত্তর: একদমই না!** 

স্ট্রাইপের আধুনিক সিস্টেমে ৩টার জন্য আলাদা কোনো API তৈরি করতে হয় না। ব্যাকএন্ড থেকে শুধুমাত্র একটি `PaymentIntent` তৈরি করতে হয় যেখানে এই সেটিংসটি দেওয়া থাকে:

```typescript
automatic_payment_methods: { enabled: true }
```

এটি দেওয়ার সাথে সাথে স্ট্রাইপের ফ্রন্টএন্ড SDK নিজে থেকেই ইউজারের ডিভাইস ও ব্রাউজার চিনে ফেলে:
1. **iPhone বা Mac (Safari)** হলে ইউজারকে সরাসরি **Apple Pay** বাটন দেখাবে (Face ID বা Touch ID দিয়ে পে করা যাবে)।
2. **Android বা Google Chrome** হলে সরাসরি **Google Pay** বাটন দেখাবে।
3. সাধারণ ব্রাউজার হলে **Card (Visa, Mastercard, Amex)** নাম্বার ইনপুট দেওয়ার ঘর দেখাবে।

---

## ২. আমাদের প্ল্যাটফর্মের ২০% ও ৮০% পেমেন্ট কিভাবে কাজ করবে?

```
[ ১. কাস্টমার বুকিং কনফার্ম করলো ]
               │
               ▼
   [ ব্যাকএন্ডে কল হবে: create-intent ]
   • ২০% টাকার জন্য PaymentIntent তৈরি হবে
   • setup_future_usage: 'off_session' থাকবে (ভবিষ্যতে কাটার অনুমতি)
               │
               ▼
[ ফ্রন্টএন্ডে clientSecret দিয়ে পেমেন্ট ফর্ম লোড হবে ]
   • কাস্টমার Apple Pay, Google Pay বা কার্ড দিয়ে ২০% পে করবে
               │
               ▼
[ স্ট্রাইপ থেকে Webhook আসবে: payment_intent.succeeded ]
   • ডাটাবেজে বুকিং স্ট্যাটাস হবে: initial_paid
   • কাস্টমারের কার্ড/পেমেন্ট মেথড আইডি (pm_xxx) বুকিংয়ে সেভ থাকবে
               │
               ▼
[ অ্যাপয়েন্টমেন্টের ২৪ ঘণ্টা আগে (অটোমেটিক ব্যাকগ্রাউন্ড ক্রন জব) ]
   • কাস্টমারকে ছাড়াই সেভ করা কার্ড থেকে বাকি ৮০% চার্জ করা হবে
               │
               ├──► সফল হলে: বুকিং স্ট্যাটাস হবে PAID
               └──► ব্যর্থ হলে: কাস্টমারকে ২-৪ ঘণ্টার মধ্যে পে করার SMS/Email পাঠানো হবে
               │
               ▼
[ সার্ভিস সম্পন্ন হলে ]
   • প্ল্যাটফর্মের ২০% ফি এবং GST রেখে বাকি টাকা আর্টিস্টের ব্যাংক/স্ট্রাইপ অ্যাকাউন্টে ট্রান্সফার হবে
```

---

## ৩. ব্যাকএন্ডের প্রধান ২টি কাজ (Simple Code)

### কাজ ১: প্রথম ২০% কাটার API তৈরি করা
কাস্টমার যখন বুকিং করবে, তখন ফ্রন্টএন্ডে এই API কল হবে। এটি স্ট্রাইপ থেকে একটি `clientSecret` এনে ফ্রন্টএন্ডকে দিবে:

```typescript
// apps/server/src/app/libs/stripe.ts

export const createDepositIntent = async ({
  bookingId,
  customerId,
  depositAmountInAud, // উদাহরণ: $20.00
  clientEmail,
}: {
  bookingId: string
  customerId: string
  depositAmountInAud: number
  clientEmail: string
}) => {
  return await stripe.paymentIntents.create({
    amount: Math.round(depositAmountInAud * 100), // সেন্টে কনভার্ট (যেমন: ২০ ডলার = ২০০০ সেন্ট)
    currency: 'aud',
    customer: customerId,
    receipt_email: clientEmail,
    
    // কার্ড, Apple Pay, Google Pay অটোমেটিক চালু রাখার জন্য:
    automatic_payment_methods: { enabled: true },
    
    // এই লাইনের কারণে কাস্টমারের কার্ড সেভ থাকবে, যাতে ২৪ ঘণ্টা আগে বাকি ৮০% কাটা যায়:
    setup_future_usage: 'off_session',
    
    metadata: {
      bookingId,
      paymentType: 'INITIAL_20',
    },
  })
}
```

---

### কাজ ২: ২৪ ঘণ্টা আগে বাকি ৮০% অটোমেটিক কাটার ফাংশন
অ্যাপয়েন্টমেন্টের ২৪ ঘণ্টা আগে আমাদের ব্যাকগ্রাউন্ড শিডিউলার/ক্রন জব এই ফাংশনটি চালাবে:

```typescript
export const chargeBalanceIntent = async ({
  bookingId,
  customerId,
  savedPaymentMethodId, // ২০% পে করার সময় যে কার্ড সেভ হয়েছিল
  balanceAmountInAud,   // উদাহরণ: $80.00
}: {
  bookingId: string
  customerId: string
  savedPaymentMethodId: string
  balanceAmountInAud: number
}) => {
  return await stripe.paymentIntents.create({
    amount: Math.round(balanceAmountInAud * 100),
    currency: 'aud',
    customer: customerId,
    payment_method: savedPaymentMethodId,
    
    // কাস্টমার বর্তমানে অ্যাপে নেই, ব্যাকগ্রাউন্ডে চার্জ হচ্ছে:
    off_session: true,
    confirm: true, // সাথে সাথে টাকা কেটে নিবে
    
    metadata: {
      bookingId,
      paymentType: 'BALANCE_80',
    },
  })
}
```

---

## ৪. ফ্রন্টএন্ডে কি করতে হবে?

ফ্রন্টএন্ডে (React / Next.js) কোনো জটিল কোড নেই। স্ট্রাইপের অফিসিয়াল `<PaymentElement />` ব্যবহার করলেই হয়:

```tsx
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'

// ব্যাকএন্ডের ফেরত দেওয়া clientSecret এখানে বসবে:
<Elements stripe={stripePromise} options={{ clientSecret }}>
  <form onSubmit={handlePay}>
    {/* এই একটা কম্পোনেন্টই কার্ড, Apple Pay ও Google Pay নিজে হ্যান্ডেল করবে */}
    <PaymentElement />
    <button type="submit">Pay Deposit</button>
  </form>
</Elements>
```

---

## ৫. Apple Pay ও Google Pay চালু করার নিয়ম

| গেটওয়ে | টেস্ট মোডে (Development) | লাইভ মোডে (Production) |
|---|---|---|
| **Cards** | টেস্ট কার্ড (4242 4242...) দিয়ে সাথে সাথে টেস্ট করা যায় | কোনো ভেরিফিকেশন লাগে না |
| **Google Pay** | ব্রাউজারে কার্ড সেভ থাকলে সাথে সাথে টেস্ট করা যায় | কোনো বাড়তি কাজ নেই, অটো চালু থাকে |
| **Apple Pay** | Mac / Safari বা iPhone-এ টেস্ট কার্ড দিয়ে কাজ করে | **১.** ওয়েবসাইট অবশ্যই HTTPS হতে হবে。<br>**২.** স্ট্রাইপ ড্যাশবোর্ড থেকে একটি ফাইল ডাউনলোড করে `/.well-known/apple-developer-merchantid-domain-association` পাথে রাখতে হবে। |

---

## ৬. সংক্ষেপে মনে রাখার বিষয়:
1. কার্ড, Apple Pay, Google Pay-এর জন্য **আলাদা কোড লাগে না**; `automatic_payment_methods: { enabled: true }` দিলেই সব চলে আসে।
2. ২০% পেমেন্টে `setup_future_usage: 'off_session'` দিতে হবে, যাতে বাকি ৮০% কাটার জন্য কার্ড সেভ থাকে।
3. পেমেন্ট সফল হয়েছে কি না তা সব সময় **Stripe Webhook** (`payment_intent.succeeded`) দিয়ে কনফার্ম করে ডাটাবেজ আপডেট করতে হবে।
