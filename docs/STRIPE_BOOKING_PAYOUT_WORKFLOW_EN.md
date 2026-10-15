# 💳 Stripe Implementation, Invoicing & Post-Completion Payout Workflow

> **Quick Summary:** 
> **Yes, this entire flow—including split payments, holding funds, and ATO-compliant invoicing—is 100% supported by Stripe Connect and represents Stripe's official best practice for marketplace platforms.**
> 
> As outlined in [BOOKING_INVOICING_GST_HOLD_GUIDE_BN.md](file:///c:/Users/Mostafizur%20Rahaman/Desktop/tss_workspace/mimilini-booking-platform/docs/BOOKING_INVOICING_GST_HOLD_GUIDE_BN.md), STUNNER ALERT is legally classified as an **Electronic Distribution Platform (EDP)** under Australian law. Because STUNNER ALERT is not the supplier of the core beauty service, the platform **must never issue a single invoice covering the entire service amount in its own name**. 
> 
> Instead, the system must generate **TWO DISTINCT INVOICES** for every booking transaction.

---

## 1. The Two-Invoice Architecture (EDP Compliance)

```
                       TOTAL BOOKING VALUE ($550.00 AUD)
                                      │
          ┌───────────────────────────┴───────────────────────────┐
          ▼                                                       ▼
┌──────────────────────────────────────┐        ┌──────────────────────────────────────┐
│  INVOICE 1: Customer Master Invoice  │        │   INVOICE 2: Platform RCTI Invoice   │
│  (Progressive Tax Invoice)           │        │   (Recipient Created Tax Invoice)    │
├──────────────────────────────────────┤        ├──────────────────────────────────────┤
│ • Issuer: Professional (Artist)      │        │ • Issuer: STUNNER ALERT PTY LTD      │
│ • Recipient: Customer (Client)       │        │ • Recipient: Professional (Artist)   │
│ • Amount: Full Service ($550.00 AUD) │        │ • Amount: Platform Fee ($110.00 AUD) │
│ • Generated: At Booking Confirmation │        │ • Generated: At Service Completion   │
│ • Stripe API: on_behalf_of Artist    │        │ • Stripe API: Platform Invoice/RCTI  │
│ • Terms: 20% Paid, 80% Due 24h Prior │        │ • Status: [PAID VIA DEDUCTION]       │
└──────────────────────────────────────┘        └──────────────────────────────────────┘
```

### Side-by-Side Comparison of the Two Invoices:

| Feature | Invoice 1: Customer Master Invoice | Invoice 2: Platform RCTI Invoice |
| :--- | :--- | :--- |
| **Legal Document Type** | Tax Invoice / Progressive Payment Invoice | Recipient Created Tax Invoice (RCTI) |
| **Issuer (Seller)** | **Independent Professional** (Artist Name & ABN) | **STUNNER ALERT PTY LTD** (ABN 88 701 443 129) |
| **Recipient (Buyer)** | **Customer** (Client Name & Details) | **Independent Professional** (Artist) |
| **What It Covers** | Core Beauty / Styling Service ($500 Base + $50 GST) | Platform Marketplace Facilitation Fee (20% + 10% GST on Fee) |
| **Total Amount** | **`$550.00 AUD`** | **`$110.00 AUD`** |
| **Stripe Mechanism** | Stripe Invoicing with `on_behalf_of: artistConnectedAccountId` | Stripe Invoicing (Platform Merchant Account to Artist Customer ID) |
| **Timing of Issue** | Generated at booking confirmation; updated receipt issued when 80% balance is charged at 24h | Generated upon service completion when net payout ($440) is transferred |
| **Payment Status** | Displays: `$110 PAID` at booking, `$440 DUE 24h prior`. Once 80% is captured: `[PAID IN FULL]` | Marked as: `[PAID VIA DEDUCTION]` (withheld from customer gross collection) |
| **Cancellation Handling** | If balance fails/cancelled: Stripe Credit Note (ATO Adjustment Note) nullifies this invoice | If booking is cancelled, no RCTI is generated |
| **Tax Purpose** | Allows customer to see compliant tax breakdown; establishes artist as the seller of record | Allows artist to claim $10.00 GST input tax credit on their Business Activity Statement (BAS) |

---

## 2. End-to-End Workflow with Both Invoices & Holding Funds

```
[ Customer Confirms Booking ]
             │
             ├──► 1. Stripe PaymentIntent captures 20% Deposit ($110 AUD)
             │       Card securely saved for off-session future usage
             │
             └──► 2. INVOICE 1 GENERATED: Customer Master Invoice
                     • Issued on_behalf_of: artist.stripeConnectedAccountId
                     • Custom Fields: Deposit $110 PAID, Balance $440 DUE 24h prior
             │
             ▼
[ 24 Hours Before Appointment ]
             │
             ├──► 3. Automated Off-Session Charge captures 80% Balance ($440 AUD)
             │       Funds collected into Platform's Stripe Balance (transfer_group)
             │
             ├──► Succeeded ──► INVOICE 1 UPDATED: Receipt marked [PAID IN FULL]
             │                  Funds HELD in Platform Balance until completion
             │
             └──► Failed ──► 2 to 4 Hour Rectification Window with Pay Link
                             If unpaid: Booking Cancelled
                             ──► Stripe Credit Note (Adjustment Note) nullifies Invoice 1
             │
             ▼
[ Service Completed by Artist ]
             │
             ├──► 4. Payout Released: stripe.transfers.create
             │       Transfers Net Payout ($440 AUD) to Artist Connected Account
             │
             └──► 5. INVOICE 2 GENERATED: Platform RCTI Invoice
                     • Issued by STUNNER ALERT to Artist
                     • Documents $110 Deduction ($100 fee + $10 GST on fee)
                     • Status: [PAID VIA DEDUCTION]
```

---

## 3. Step-by-Step Implementation (APIs & Code)

---

### Step 1: Initial 20% Deposit & Card Vaulting

When a booking is confirmed, capture the 20% deposit and vault the payment method for the upcoming 80% balance charge.

```typescript
// backend/services/payment.service.ts
import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' });

export async function processInitialDeposit(booking: any, customer: any) {
  // 1. Create PaymentIntent with off-session setup enabled
  const paymentIntent = await stripe.paymentIntents.create({
    amount: 11000, // $110.00 AUD (20% deposit: $100 base + $10 GST)
    currency: 'aud',
    customer: customer.stripeCustomerId, // 'cus_xxx'
    setup_future_usage: 'off_session', // ⭐️ Vaults card for future automated balance charge
    transfer_group: `booking_${booking._id}`, // ⭐️ Groups all transactions for this booking
    metadata: {
      bookingId: booking._id.toString(),
      paymentType: 'initial_deposit_20',
    },
  });

  return paymentIntent;
}
```

---

### Step 2: Generate INVOICE 1 — Customer Master Progressive Invoice (`on_behalf_of`)

Because STUNNER ALERT is an EDP, the core service belongs to the freelancer. Stripe Invoicing allows STUNNER ALERT to generate the invoice on the artist's behalf:

```typescript
// backend/services/invoice.service.ts

export async function createCustomerMasterInvoice(booking: any, customer: any, artist: any) {
  // 1. Line Item: Service Base Price
  await stripe.invoiceItems.create({
    customer: customer.stripeCustomerId,
    amount: 50000, // $500.00 AUD Base Price
    currency: 'aud',
    description: `${booking.serviceName} - Provided by ${artist.businessName}`,
  });

  // 2. Line Item: GST (10%) if Artist is GST-Registered (Exclusive Model)
  if (artist.isGstRegistered) {
    await stripe.invoiceItems.create({
      customer: customer.stripeCustomerId,
      amount: 5000, // $50.00 AUD (10% GST on Service)
      currency: 'aud',
      description: 'Goods and Services Tax (GST 10%)',
    });
  }

  // 3. Create Progressive Master Invoice ON BEHALF OF the Artist
  const invoice = await stripe.invoices.create({
    customer: customer.stripeCustomerId,
    on_behalf_of: artist.stripeConnectedAccountId, // ⭐️ Artist's ABN and business name printed as supplier
    auto_advance: false, // Manual control over progressive collection
    custom_fields: [
      { name: 'Initial Deposit (20%)', value: '$110.00 AUD [PAID via Platform]' },
      { name: 'Balance Outstanding (80%)', value: `$440.00 AUD [Due 24h prior to appointment]` },
    ],
    metadata: {
      bookingId: booking._id.toString(),
      invoiceType: 'customer_progressive_master_invoice',
      documentNumber: 'INVOICE_1',
    },
  });

  // 4. Finalize the invoice to generate PDF & hosted invoice URL
  const finalizedInvoice = await stripe.invoices.finalizeInvoice(invoice.id);

  booking.customerInvoiceId = finalizedInvoice.id;
  booking.customerInvoicePdfUrl = finalizedInvoice.invoice_pdf;
  await booking.save();

  return finalizedInvoice;
}
```

---

### Step 3: Automated 80% Balance Charge (24h Prior) & Holding Funds

A background job scheduler (e.g. BullMQ) triggers 24 hours prior to appointment commencement.

```typescript
// backend/jobs/chargeBalancePayment.job.ts

export async function executeBalancePayment(booking: any, customer: any) {
  const balancePaymentIntent = await stripe.paymentIntents.create({
    amount: 44000, // $440.00 AUD (Remaining 80% balance)
    currency: 'aud',
    customer: customer.stripeCustomerId,
    payment_method: customer.defaultPaymentMethodId, // Saved card vaulted in Step 1
    off_session: true, // ⭐️ Charges without requiring customer to be online
    confirm: true, // ⭐️ Immediately executes charge
    transfer_group: `booking_${booking._id}`, // ⭐️ Same transfer group
    metadata: {
      bookingId: booking._id.toString(),
      paymentType: 'balance_payment_80',
    },
  });

  // When payment succeeds:
  // 1. Funds are collected into STUNNER ALERT's platform Stripe balance.
  // 2. The funds sit safely in the platform balance. Artist CANNOT access them yet.
  // 3. Stripe automatically updates the charge receipt confirming full balance is PAID.
  booking.balancePaymentStatus = 'paid';
  booking.balancePaymentIntentId = balancePaymentIntent.id;
  booking.balancePaidAt = new Date();
  await booking.save();

  return balancePaymentIntent;
}
```

---

### Step 4: 24h Failure Safeguard & Stripe Credit Note (Adjustment Note for Invoice 1)

If the customer's card is declined or has insufficient funds:

```typescript
// backend/services/payment-failure.service.ts

export async function handleBalancePaymentFailure(booking: any, customer: any) {
  await Booking.findByIdAndUpdate(booking._id, { 
    status: 'balance_payment_failed',
    rectificationDeadline: new Date(Date.now() + 3 * 60 * 60 * 1000), // 3-hour window
  });

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

  await sendNotification(customer.phone, `Alert: Please pay your booking balance within 3 hours: ${session.url}`);
}
```

#### If Customer Fails to Pay within the 2–4 Hour Window:
The booking is cancelled. To comply with ATO rules, an **Adjustment Note (Credit Note)** is generated using Stripe to legally nullify Invoice 1:

```typescript
// backend/services/credit-note.service.ts

export async function cancelBookingAndIssueCreditNote(booking: any) {
  // 1. Issue Stripe Credit Note to nullify Invoice 1
  const creditNote = await stripe.creditNotes.create({
    invoice: booking.customerInvoiceId,
    reason: 'order_cancellation',
    memo: 'Cancelled due to unpaid balance 24 hours prior to service.',
  });

  // 2. Free up artist's calendar slot
  booking.status = 'cancelled_due_to_nonpayment';
  booking.creditNoteId = creditNote.id;
  booking.creditNotePdfUrl = creditNote.pdf;
  await booking.save();

  return creditNote;
}
```

---

### Step 5: Service Completion & Payout Release (The Payout)

During the 24-hour window, the money sits safely in the platform's Stripe balance. When the service is completed (artist taps "Complete" or customer confirms via OTP/sign-off):

```typescript
// backend/services/booking-completion.service.ts

export async function completeBookingAndReleasePayout(bookingId: string) {
  const booking = await Booking.findById(bookingId).populate('artist');
  const artist = booking.artist; // Contains artist.stripeConnectedAccountId

  // 1. Calculate Net Payout:
  // Gross Collected = $550 AUD ($500 Base + $50 GST)
  // Platform Deduction = $110 AUD ($100 Commission 20% + $10 GST on Commission 10%)
  // Net Payout to Artist = $550 - $110 = $440.00 AUD
  const netPayoutInCents = 44000; 

  // 2. ⭐️ Execute Stripe Transfer from Platform Balance to Artist Connected Account
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
    idempotencyKey: `payout_transfer_${booking._id}`, // ⭐️ Prevents duplicate payouts
  });

  // 3. Mark booking as completed
  booking.status = 'completed';
  booking.payoutStatus = 'transferred';
  booking.stripeTransferId = transfer.id;
  booking.completedAt = new Date();
  await booking.save();

  // 4. Trigger Generation of INVOICE 2 (Platform RCTI)
  await generatePlatformRCTI(booking, artist);

  return transfer;
}
```

---

### Step 6: Generate INVOICE 2 — Platform Facilitation Fee Tax Invoice (RCTI)

Under Clause 12.6 of the Professional Terms, STUNNER ALERT issues a **Recipient Created Tax Invoice (RCTI)** to the artist for the 20% commission ($100) + 10% GST on fee ($10) deducted:

```typescript
// backend/services/rcti.service.ts

export async function generatePlatformRCTI(booking: any, artist: any) {
  // STUNNER ALERT generates an invoice to the artist documenting the deducted software fee
  const rctiInvoice = await stripe.invoices.create({
    customer: artist.platformStripeCustomerId, // Artist as customer of STUNNER ALERT software
    auto_advance: true,
    collection_method: 'send_invoice', // Documenting already-deducted fee
    custom_fields: [
      { name: 'Document Type', value: 'Recipient Created Tax Invoice (RCTI)' },
      { name: 'Marketplace Facilitation Fee (20%)', value: '$100.00 AUD' },
      { name: 'GST on Facilitation Fee (10%)', value: '$10.00 AUD' },
      { name: 'Total Fee Deducted', value: '$110.00 AUD [PAID VIA DEDUCTION]' },
      { name: 'Legal Authority', value: 'Clause 12.6 Professional Terms (STUNNER ALERT)' },
    ],
    metadata: {
      bookingId: booking._id.toString(),
      invoiceType: 'platform_facilitation_fee_rcti',
      documentNumber: 'INVOICE_2',
      serrReportable: 'true',
    },
  });

  const finalizedRcti = await stripe.invoices.finalizeInvoice(rctiInvoice.id);
  booking.rctiInvoiceId = finalizedRcti.id;
  booking.rctiInvoicePdfUrl = finalizedRcti.invoice_pdf;
  await booking.save();

  return finalizedRcti;
}
```

---

## 4. Artist Cancellation Penalty via Account Lock Screen

When an artist cancels a confirmed booking and incurs a fine (e.g. $60 AUD under [platform-settings.model.ts](file:///c:/Users/Mostafizur%20Rahaman/Desktop/tss_workspace/mimilini-booking-platform/packages/db/src/apps/modules/PlatformSettings/platform-settings.model.ts)):

```typescript
// 1. Freeze artist booking permissions
await User.findByIdAndUpdate(artist.userId, {
  status: 'penalty_unpaid',
  'pendingPenalty.amount': 60,
  'pendingPenalty.bookingId': booking._id,
  'pendingPenalty.isPaid': false,
});
```

### In-App Screen & Payment:
- Artist opens the app and sees: **"Account Restricted - Pay $60 AUD to Unlock"**.
- Tapping "Pay Now" initiates a direct card payment to STUNNER ALERT's platform Stripe account.
- When `payment_intent.succeeded` fires for the penalty, `user.status` immediately resets to `'active'`, unlocking their calendar.

---

## 5. Webhooks & Invoicing Events Matrix

| Webhook Event | Trigger Timing | Booking State | Invoicing Action Triggered |
| :--- | :--- | :--- | :--- |
| `payment_intent.succeeded` (20%) | Customer confirms booking | `confirmed` | **INVOICE 1 Finalized** on behalf of artist (`on_behalf_of`) showing $110 Paid, $440 Due |
| `payment_intent.succeeded` (80%) | 24 hours prior to appointment | `paid` | **INVOICE 1 Receipt Updated** to `[PAID IN FULL - $550 AUD]` |
| `payment_intent.payment_failed` (80%) | 24 hours prior balance fails | `balance_payment_failed` | Sends 2–4 hour rectification link |
| `credit_note.created` | Rectification deadline expired | `cancelled` | **INVOICE 1 Nullified** via Stripe Credit Note (ATO Adjustment Note) |
| `transfer.created` | Service marked completed | `completed` | **INVOICE 2 (RCTI) Generated** documenting $110 platform fee deduction |
| `payment_intent.succeeded` (penalty) | Artist pays cancellation fine | `active` | Sends penalty payment receipt to artist |
