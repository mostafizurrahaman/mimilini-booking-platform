# 💳 Stripe ইমপ্লিমেন্টেশন, ইনভয়েসিং এবং পে-আউট ওয়ার্কফ্লো

> **সরাসরি উত্তর:** 
> **হ্যাঁ, সম্পূর্ণ ফ্লো—স্প্লিট পেমেন্ট, টাকা হোল্ড রাখা এবং ATO-সম্মত ইনভয়েসিং—Stripe Connect দিয়ে ১০০% সম্ভব এবং এটি Stripe-এর অফিসিয়াল বেস্ট প্র্যাকটিস!**
> 
> কাস্টমারের কাছ থেকে পেমেন্ট নেওয়া, ইনভয়েস জেনারেট করা, ২৪ ঘণ্টা আগে টাকা কেটে প্ল্যাটফর্মে হোল্ড রাখা এবং সার্ভিস শেষে আর্টিস্টের একাউন্টে টাকা পাঠানো—তার স্টেপ-বাই-স্টেপ টেকনিক্যাল গাইড নিচে দেওয়া হলো।

---

## ১. মূল আর্কিটেকচার: Stripe Connect "Separate Charges & Transfers" + ইনভয়েসিং

আমাদের প্ল্যাটফর্ম একটি **Electronic Distribution Platform (EDP)**। তাই এখানে দুটি প্রধান Stripe ফিচার একসাথে কাজ করে:
1. **Stripe Invoicing (`on_behalf_of`):** কাস্টমার ইনভয়েসে আর্টিস্টের নাম ও ABN সেলার হিসেবে প্রিন্ট করবে, যার ফলে প্ল্যাটফর্মের কোনো ট্যাক্স ঝামেলা হবে না।
2. **Separate Charges and Transfers (`transfer_group`):** কাস্টমারের টাকা প্ল্যাটফর্মের নিজের Stripe ব্যালেন্সে হোল্ড রাখবে যতক্ষণ না বিউটি সার্ভিস শেষ হয়।

```
┌───────────────────────────────────────────────────────────────────────────────┐
│                           বুকিং লাইফসাইকেল ($৫৫০ AUD)                           │
└──────────────────────────────────────┬────────────────────────────────────────┘
                                       │
            ১. ২০% ডিপোজিট চার্জ + মাস্টার ইনভয়েস তৈরি (Booking Confirmation)
               • Stripe PaymentIntent দিয়ে $১১০ কাটা হলো
               • কার্ডটি সেভ রইলো (setup_future_usage: 'off_session')
               • Stripe Invoice তৈরি হলো (on_behalf_of: artistConnectedAccountId)
               • প্রগ্রেসিভ টার্মস: $১১০ পেইড, $৪৪০ ব্যালেন্স বকেয়া
                                       │
                                       ▼
            ২. ২৪ ঘণ্টা আগে বাকি ৮০% ব্যালেন্স চার্জ (Holding Period)
               • অফ-সেশন PaymentIntent দিয়ে $৪৪০ চার্জ করা হলো
               • টাকা প্ল্যাটফর্মের Stripe ব্যালেন্সে জমা রইলো (transfer_group)
               • Stripe স্বয়ংক্রিয় রসিদ আপডেট করে দিল: [PAID IN FULL]
               • (পেমেন্ট ফেইল করলে ──► Stripe Credit Note দিয়ে ইনভয়েস বাতিল)
                                       │
                                       ▼
            ৩. সার্ভিস সম্পন্ন হওয়া ও পে-আউট রিলিজ (Completion)
               • আর্টিস্ট কাজ শেষ করলো
               • stripe.transfers.create দিয়ে $৪৪০ নেট টাকা আর্টিস্টের একাউন্টে চলে গেল
               • প্ল্যাটফর্ম তার $১১০ ফি-র জন্য RCTI ইনভয়েস ইস্যু করলো
```

---

## ২. স্টেপ-বাই-স্টেপ ইমপ্লিমেন্টেশন (APIs ও কোডসহ)

---

### স্টেপ ১: বুকিংয়ের সময় ২০% ডিপোজিট ও কার্ড সেভ করা

কাস্টমার যখন বুকিং কনফার্ম করে, আমরা ২০% চার্জ করব এবং তার কার্ডটি ভবিষ্যতের জন্য সেভ রাখব।

```typescript
// backend/services/payment.service.ts
import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' });

export async function processInitialDeposit(booking: any, customer: any) {
  // ১. PaymentIntent তৈরি ও কার্ড সেভ করা
  const paymentIntent = await stripe.paymentIntents.create({
    amount: 11000, // $110.00 AUD (২০% ডিপোজিট: বেস $১০০ + GST $১০)
    currency: 'aud',
    customer: customer.stripeCustomerId, // 'cus_xxx'
    setup_future_usage: 'off_session', // ⭐️ কার্ডটি পরবর্তীতে ২৪ ঘণ্টা আগে অটো কাটার জন্য সেভ রাখবে
    transfer_group: `booking_${booking._id}`, // ⭐️ এই বুকিংয়ের সব লেনদেন এক গ্রুপে রাখবে
    metadata: {
      bookingId: booking._id.toString(),
      paymentType: 'initial_deposit_20',
    },
  });

  return paymentIntent;
}
```

---

### স্টেপ ২: Stripe দিয়ে কাস্টমার মাস্টার ইনভয়েস তৈরি (`on_behalf_of`)

যেহেতু মূল সার্ভিসটি আর্টিস্ট দিচ্ছে, তাই Stripe Invoicing-এর `on_behalf_of` ব্যবহার করে আর্টিস্টের পক্ষ থেকে ইনভয়েস জেনারেট করা হবে:

```typescript
// backend/services/invoice.service.ts

export async function createCustomerMasterInvoice(booking: any, customer: any, artist: any) {
  // ১. ইনভয়েসে সার্ভিসের বেস প্রাইস যোগ করা
  await stripe.invoiceItems.create({
    customer: customer.stripeCustomerId,
    amount: 50000, // $500.00 AUD বেস প্রাইস
    currency: 'aud',
    description: `${booking.serviceName} - Supplied by ${artist.businessName}`,
  });

  // ২. আর্টিস্ট যদি GST রেজিস্টার্ড হয়, তবে ১০% GST লাইন যোগ করা (Exclusive মডেল)
  if (artist.isGstRegistered) {
    await stripe.invoiceItems.create({
      customer: customer.stripeCustomerId,
      amount: 5000, // $50.00 AUD (১০% GST)
      currency: 'aud',
      description: 'Goods and Services Tax (GST 10%)',
    });
  }

  // ৩. আর্টিস্টের পক্ষে প্রগ্রেসিভ মাস্টার ইনভয়েস তৈরি
  const invoice = await stripe.invoices.create({
    customer: customer.stripeCustomerId,
    on_behalf_of: artist.stripeConnectedAccountId, // ⭐️ আর্টিস্টের ABN ও নাম সেলার হিসেবে প্রিন্ট হবে
    auto_advance: false, // ম্যানুয়াল প্রগ্রেসিভ ট্র্যাকিংয়ের জন্য
    custom_fields: [
      { name: 'Initial Deposit (20%)', value: '$110.00 AUD [PAID via Platform]' },
      { name: 'Balance Outstanding (80%)', value: `$440.00 AUD [Due 24h prior to appointment]` },
    ],
    metadata: {
      bookingId: booking._id.toString(),
      invoiceType: 'customer_progressive_master_invoice',
    },
  });

  // ৪. ইনভয়েস ফাইনালাইজ করে PDF ও লিংক পাওয়া
  const finalizedInvoice = await stripe.invoices.finalizeInvoice(invoice.id);

  booking.invoiceId = finalizedInvoice.id;
  booking.invoicePdfUrl = finalizedInvoice.invoice_pdf;
  await booking.save();

  return finalizedInvoice;
}
```

> **অস্ট্রেলিয়ান ট্যাক্স (ATO) সুবিধা:**
> - ইনভয়েসে পরিষ্কারভাবে আর্টিস্টের বিজনেস নাম ও ABN থাকবে।
> - STUNNER ALERT-এর উপর কোনো ভুল সেলস ট্যাক্স আসবে না।
> - কাস্টমার দেখতে পাবে: $১১০ আজ পেইড এবং $৪৪০ অ্যাপয়েন্টমেন্টের ২৪ ঘণ্টা আগে বকেয়া।

---

### স্টেপ ৩: অ্যাপয়েন্টমেন্টের ২৪ ঘণ্টা আগে ৮০% ব্যালেন্স চার্জ ও রসিদ আপডেট

একটি ব্যাকগ্রাউন্ড শিডিউলার অ্যাপয়েন্টমেন্টের ঠিক ২৪ ঘণ্টা আগে স্বয়ংক্রিয়ভাবে সেভ করা কার্ড থেকে ব্যালেন্স চার্জ করবে:

```typescript
// backend/jobs/chargeBalancePayment.job.ts

export async function executeBalancePayment(booking: any, customer: any) {
  const balancePaymentIntent = await stripe.paymentIntents.create({
    amount: 44000, // $440.00 AUD (বাকি ৮০% ব্যালেন্স)
    currency: 'aud',
    customer: customer.stripeCustomerId,
    payment_method: customer.defaultPaymentMethodId, // স্টেপ ১-এ সেভ করা কার্ড
    off_session: true, // ⭐️ কাস্টমার অনলাইনে না থাকলেও কার্ড থেকে চার্জ হবে
    confirm: true, // ⭐️ সাথে সাথে চার্জ হবে
    transfer_group: `booking_${booking._id}`, // ⭐️ একই গ্রুপ
    metadata: {
      bookingId: booking._id.toString(),
      paymentType: 'balance_payment_80',
    },
  });

  // চার্জ সফল হলে:
  // ১. টাকাটা STUNNER ALERT-এর মূল Stripe Balance-এ নিরাপদে হোল্ড থাকবে।
  // ২. Stripe স্বয়ংক্রিয়ভাবে কাস্টমারকে [PAID IN FULL - $550 AUD] রসিদ দিয়ে দেবে।
  booking.balancePaymentStatus = 'paid';
  booking.balancePaymentIntentId = balancePaymentIntent.id;
  booking.balancePaidAt = new Date();
  await booking.save();

  return balancePaymentIntent;
}
```

---

### স্টেপ ৪: ২৪ ঘণ্টার সেফগার্ড ও পেমেন্ট ব্যর্থ হলে Credit Note (Adjustment Note)

যদি কাস্টমারের কার্ড ডিক্লাইন হয়:

```typescript
// backend/services/payment-failure.service.ts

export async function handleBalancePaymentFailure(booking: any, customer: any) {
  // ১. স্ট্যাটাস পরিবর্তন
  await Booking.findByIdAndUpdate(booking._id, { 
    status: 'balance_payment_failed',
    rectificationDeadline: new Date(Date.now() + 3 * 60 * 60 * 1000), // ৩ ঘণ্টা সময়
  });

  // ২. কাস্টমারকে পে করার জন্য Stripe Checkout Session লিংক তৈরি
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    customer: customer.stripeCustomerId,
    line_items: [{
      price_data: {
        currency: 'aud',
        product_data: { name: `Balance Payment for Booking #${booking.bookingNumber}` },
        unit_amount: 44000,
      },
      quantity: 1,
    }],
    mode: 'payment',
    success_url: `https://app.stunneralert.com/booking/${booking._id}/payment-success`,
    cancel_url: `https://app.stunneralert.com/booking/${booking._id}/payment-failed`,
  });

  // ৩. কাস্টমারকে SMS / Push পাঠানো
  await sendNotification(customer.phone, `Alert: Please pay your booking balance within 3 hours: ${session.url}`);
}
```

#### ২-৪ ঘণ্টার মধ্যে কাস্টমার পে না করলে:
বুকিং বাতিল হবে এবং পূর্বে তৈরি করা ইনভয়েসটি আইনিভাবে বাতিল করার জন্য Stripe দিয়ে **Adjustment Note (Credit Note)** তৈরি করা হবে:

```typescript
// backend/services/credit-note.service.ts

export async function cancelBookingAndIssueCreditNote(booking: any) {
  // ১. Stripe Credit Note তৈরি (ATO Adjustment Note)
  const creditNote = await stripe.creditNotes.create({
    invoice: booking.invoiceId,
    reason: 'order_cancellation',
    memo: 'Cancelled due to unpaid balance 24 hours prior to appointment.',
  });

  // ২. বুকিং বাতিল ও আর্টিস্টের স্লট মুক্ত করা
  booking.status = 'cancelled_due_to_nonpayment';
  booking.creditNoteId = creditNote.id;
  booking.creditNotePdfUrl = creditNote.pdf;
  await booking.save();

  return creditNote;
}
```

---

### স্টেপ ৫: সার্ভিস সম্পন্ন হওয়া এবং আর্টিস্টের একাউন্টে টাকা ট্রান্সফার (The Payout)

**টাকা কিভাবে সার্ভিস শেষের পর আর্টিস্টের একাউন্টে যাবে?**

২৪ ঘণ্টা আগের টাকা প্ল্যাটফর্মের ব্যালেন্সে হোল্ড থাকে। যখন আর্টিস্ট কাজ শেষ করবে (অ্যাপে "Mark as Completed"):

```typescript
// backend/services/booking-completion.service.ts

export async function completeBookingAndReleasePayout(bookingId: string) {
  const booking = await Booking.findById(bookingId).populate('artist');
  const artist = booking.artist; // এতে artist.stripeConnectedAccountId আছে

  // ১. আর্টিস্টের নেট পে-আউট হিসাব:
  // মোট কালেকশন = $৫৫০ AUD ($৫০০ বেস + $৫০ GST)
  // প্ল্যাটফর্ম কর্তন = $১১০ AUD ($১০০ কমিশন ২০% + $১০ কমিশনের GST)
  // আর্টিস্ট নেট পাবে = $৫৫০ - $১১০ = $৪৪০.০০ AUD
  const netPayoutInCents = 44000; 

  // ২. ⭐️ Stripe Transfer দিয়ে আর্টিস্টের কানেক্টেড একাউন্টে টাকা রিলিজ
  const transfer = await stripe.transfers.create({
    amount: netPayoutInCents,
    currency: 'aud',
    destination: artist.stripeConnectedAccountId, // 'acct_1Nxxxxxxxxxxxx'
    transfer_group: `booking_${booking._id}`,
    description: `Net Payout for Booking #${booking.bookingNumber}`,
    metadata: {
      bookingId: booking._id.toString(),
      artistId: artist._id.toString(),
    },
  }, {
    idempotencyKey: `payout_transfer_${booking._id}`, // ⭐️ যাতে ভুলে ডাবল পেমেন্ট না যায়
  });

  // ৩. বুকিং কমপ্লিট স্ট্যাটাস আপডেট
  booking.status = 'completed';
  booking.payoutStatus = 'transferred';
  booking.stripeTransferId = transfer.id;
  booking.completedAt = new Date();
  await booking.save();

  return transfer;
}
```

---

### স্টেপ ৬: প্ল্যাটফর্ম ফি-র জন্য Recipient Created Tax Invoice (RCTI)

প্রফেশনাল টার্মস ক্লজ ১২.৬ অনুযায়ী প্ল্যাটফর্ম আর্টিস্টকে তার ২০% কমিশন ($১০০) + ১০% GST ($১০) = $১১০ কর্তনের রসিদ/ইনভয়েস দেবে:

```typescript
// backend/services/rcti.service.ts

export async function generatePlatformRCTI(booking: any, artist: any) {
  const rctiInvoice = await stripe.invoices.create({
    customer: artist.platformStripeCustomerId,
    auto_advance: true,
    collection_method: 'send_invoice',
    custom_fields: [
      { name: 'Document Type', value: 'Recipient Created Tax Invoice (RCTI)' },
      { name: 'Marketplace Facilitation Fee', value: '$100.00 AUD' },
      { name: 'GST on Facilitation Fee (10%)', value: '$10.00 AUD' },
      { name: 'Total Fee Deducted', value: '$110.00 AUD [PAID VIA DEDUCTION]' },
    ],
    metadata: {
      bookingId: booking._id.toString(),
      type: 'platform_facilitation_fee_rcti',
      serrReportable: 'true',
    },
  });

  const finalizedRcti = await stripe.invoices.finalizeInvoice(rctiInvoice.id);
  booking.rctiInvoicePdfUrl = finalizedRcti.invoice_pdf;
  await booking.save();

  return finalizedRcti;
}
```

---

## ৩. আর্টিস্ট ক্যানসেল করলে জরিমানা স্ক্রিন ও পেমেন্ট (Direct Stripe Payment)

যখন কোনো আর্টিস্ট বুকিং ক্যানসেল করে এবং পেনাল্টি খায় (যেমন [PlatformSettings](file:///c:/Users/Mostafizur%20Rahaman/Desktop/tss_workspace/mimilini-booking-platform/packages/db/src/apps/modules/PlatformSettings/platform-settings.model.ts) অনুযায়ী $৬০ AUD):

```typescript
// ১. আর্টিস্ট একাউন্ট সাথে সাথে রেস্ট্রিক্ট করা
await User.findByIdAndUpdate(artist.userId, {
  status: 'penalty_unpaid',
  'pendingPenalty.amount': 60,
  'pendingPenalty.bookingId': booking._id,
  'pendingPenalty.isPaid': false,
});
```

### আর্টিস্টের স্ক্রিন ও পেমেন্ট:
- আর্টিস্ট অ্যাপে ঢুকলে দেখবে: **"Account Restricted - Pay $60 AUD to Unlock"**।
- "Pay Now" চাপলে সরাসরি প্ল্যাটফর্মের Stripe একাউন্টে পেমেন্ট হবে:

```typescript
// backend/controllers/penalty.controller.ts

const penaltyIntent = await stripe.paymentIntents.create({
  amount: 6000, // $60.00 AUD
  currency: 'aud',
  description: `Cancellation Penalty for Booking #${booking.bookingNumber}`,
  metadata: {
    artistUserId: artist.userId.toString(),
    type: 'cancellation_penalty',
  },
});
```

### পেমেন্ট সফল হলে আনলক:
```typescript
if (event.type === 'payment_intent.succeeded') {
  const paymentIntent = event.data.object;
  if (paymentIntent.metadata.type === 'cancellation_penalty') {
    const artistUserId = paymentIntent.metadata.artistUserId;

    // একাউন্ট আবার একটিভ ও সচল করা
    await User.findByIdAndUpdate(artistUserId, {
      status: 'active',
      'pendingPenalty.isPaid': true,
      'pendingPenalty.paidAt': new Date(),
    });
  }
}
```

---

## ৪. প্রয়োজনীয় Stripe Webhook ইভেন্টস চেকলিস্ট

| Webhook Event | কখন কল হবে? | সিস্টেমে কি কাজ হবে? | ইনভয়েসিং অ্যাকশন |
| :--- | :--- | :--- | :--- |
| `payment_intent.succeeded` (২০%) | বুকিংয়ের ডিপোজিট সফল হলে | স্ট্যাটাস `confirmed`, কার্ড সেভ | কাস্টমার মাস্টার ইনভয়েস ফাইনাল হবে (`on_behalf_of`) |
| `payment_intent.succeeded` (৮০%) | ২৪ ঘণ্টা আগের ব্যালেন্স সফল হলে | স্ট্যাটাস `paid` হবে | Stripe রসিদ আপডেট হয়ে [PAID IN FULL] হবে |
| `payment_intent.payment_failed` (৮০%) | ২৪ ঘণ্টা আগের চার্জ ফেইল করলে | স্ট্যাটাস `balance_payment_failed` হবে | ২-৪ ঘণ্টার পে লিংক কাস্টমারকে যাবে |
| `credit_note.created` | সময় শেষ হলে বুকিং বাতিল | বুকিং ক্যানসেল, ক্যালেন্ডার ফ্রি | ATO Adjustment Note তৈরি ও ইমেইল হবে |
| `transfer.created` | সার্ভিস শেষে আর্টিস্টকে দিলে | পে-আউট লগ স্টোর হবে | প্ল্যাটফর্ম ফি-র RCTI ইনভয়েস তৈরি হবে ($১১০) |
| `payment_intent.succeeded` (fine) | আর্টিস্ট জরিমানা পে করলে | আর্টিস্ট স্ট্যাটাস `active` হবে | জরিমানার রসিদ আর্টিস্টকে পাঠানো হবে |

---

## ৫. সারাংশ টেবিল: মূল্য, ইনভয়েসিং ও পে-আউট ($৫০০ বেস প্রাইসের জন্য)

| বিষয় | আর্টিস্ট GST রেজিস্টার্ড হলে (Exclusive) | আর্টিস্ট GST রেজিস্টার্ড না হলে |
| :--- | :--- | :--- |
| **আর্টিস্টের বেস প্রাইস** | `$৫০০.০০ AUD` | `$৫০০.০০ AUD` |
| **সার্ভিসের GST (১০%)** | `+$৫০.০০ AUD` | `$০.০০ AUD` (No GST) |
| **কাস্টমার মোট পে করবে** | **`$৫৫০.০০ AUD`** | **`$৫০০.০০ AUD`** |
| **কাস্টমার ইনভয়েসে সেলার** | আর্টিস্টের নাম ও ABN (`on_behalf_of`) | আর্টিস্টের নাম ও ABN (`on_behalf_of`) |
| **২০% ডিপোজিট (বুকিংয়ে)** | `$১১০.০০ AUD` (ডিপোজিট রসিদ ইস্যু) | `$১০০.০০ AUD` (ডিপোজিট রসিদ ইস্যু) |
| **৮০% ব্যালেন্স (২৪ ঘণ্টা আগে)** | `$৪৪০.০০ AUD` (আপডেট রসিদ [PAID IN FULL]) | `$৪০০.০০ AUD` (আপডেট রসিদ [PAID IN FULL]) |
| **টাকা কোথায় হোল্ড থাকে?** | প্ল্যাটফর্মের Stripe ব্যালেন্সে (`transfer_group`) | প্ল্যাটফর্মের Stripe ব্যালেন্সে (`transfer_group`) |
| **প্ল্যাটফর্ম কমিশন (২০%)** | `$১০০.০০ AUD` | `$১০০.০০ AUD` |
| **কমিশনের উপর GST (১০%)** | `$১০.০০ AUD` | `$১০.০০ AUD` |
| **প্ল্যাটফর্ম মোট কাটবে** | **`$১১০.০০ AUD`** (ডকুমেন্টেড via RCTI) | **`$১১০.০০ AUD`** (ডকুমেন্টেড via RCTI) |
| **আর্টিস্ট পাবে (সার্ভিস শেষে)** | **`$৪৪০.০০ AUD`** (`stripe.transfers.create` দিয়ে) | **`$৩৯০.০০ AUD`** (`stripe.transfers.create` দিয়ে) |
| **ব্যালেন্স না দিলে ক্যানসেলেশন** | Stripe Credit Note দিয়ে ইনভয়েস বাতিল | Stripe Credit Note দিয়ে ইনভয়েস বাতিল |
| **আর্টিস্ট ক্যানসেল জরিমানা** | একাউন্ট `penalty_unpaid` ব্লক $\rightarrow$ স্ক্রিনে সরাসরি পে করে আনলক | একাউন্ট `penalty_unpaid` ব্লক $\rightarrow$ স্ক্রিনে সরাসরি পে করে আনলক |
