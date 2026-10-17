# 💳 Stripe PaymentIntent Guide: Cards, Apple Pay & Google Pay

This document explains how to implement Stripe PaymentIntents to support **Credit/Debit Cards**, **Apple Pay**, and **Google Pay** on the Mimilini booking platform, while supporting the **20% initial deposit** and **80% off-session balance charge**.

---

## ⚡ How Cards, Apple Pay & Google Pay Work Together

With Stripe's modern API, you **do not** need separate endpoints for Cards, Apple Pay, and Google Pay. 

When you configure:
```typescript
automatic_payment_methods: { enabled: true }
```
Stripe's client SDK automatically:
- Shows **Apple Pay** on Apple devices (Safari / iOS).
- Shows **Google Pay** on supported browsers/devices (Chrome / Android).
- Shows **Credit / Debit Card** inputs for all users.

---

## 🔄 End-to-End Payment Flow

```
[ Frontend: Checkout ]
       │
       ▼  1. Calls POST /api/v1/payments/create-intent (amount = 20% deposit)
[ Mimilini Server ]
       │
       ▼  2. Creates Stripe Customer + PaymentIntent (setup_future_usage: 'off_session')
[ Stripe API ] ──► Returns clientSecret
       │
       ▼  3. Frontend renders Stripe Payment Element (Cards + Apple Pay + Google Pay)
[ Customer Confirms ] ──► Authorized via FaceID / TouchID / Card CVV
       │
       ▼  4. Stripe Webhook: payment_intent.succeeded
[ Server Webhook ] ──► Updates Booking to 'initial_paid', saves paymentMethodId
       │
       ▼  5. 24 Hours Before Appointment (Cron / Background Task)
[ Server Cron ] ──► Creates off_session PaymentIntent for 80% balance using saved paymentMethod
```

---

## 1. Backend API Implementation

### Step 1: Helper in `apps/server/src/app/libs/stripe.ts`

```typescript
import Stripe from 'stripe'
import configs from '@app/configs'

export const stripe = new Stripe(configs.stripe.secretKey, {
  apiVersion: '2026-09-30.endive',
})

// 1. Create Initial PaymentIntent (20% Deposit)
export const createInitialPaymentIntent = async ({
  amountInAud,
  customerId,
  bookingId,
  bookingGroupId,
  clientEmail,
}: {
  amountInAud: number
  customerId: string
  bookingId: string
  bookingGroupId: string
  clientEmail: string
}) => {
  return await stripe.paymentIntents.create({
    amount: Math.round(amountInAud * 100), // Stripe expects cents (e.g. $20.00 AUD = 2000)
    currency: 'aud',
    customer: customerId,
    // Enables Cards, Apple Pay, Google Pay, and Link automatically:
    automatic_payment_methods: { enabled: true },
    // Critical: saves payment method for the 80% balance charge 24h later
    setup_future_usage: 'off_session',
    receipt_email: clientEmail,
    metadata: {
      bookingId,
      bookingGroupId,
      paymentType: 'INITIAL_20',
    },
  })
}

// 2. Charge Balance PaymentIntent (80% Balance ~24h Prior)
export const chargeBalancePaymentIntent = async ({
  amountInAud,
  customerId,
  paymentMethodId,
  bookingId,
  bookingGroupId,
}: {
  amountInAud: number
  customerId: string
  paymentMethodId: string
  bookingId: string
  bookingGroupId: string
}) => {
  return await stripe.paymentIntents.create({
    amount: Math.round(amountInAud * 100),
    currency: 'aud',
    customer: customerId,
    payment_method: paymentMethodId,
    off_session: true,   // Customer is not on the screen
    confirm: true,       // Charge immediately
    metadata: {
      bookingId,
      bookingGroupId,
      paymentType: 'BALANCE_80',
    },
  })
}
```

---

### Step 2: Endpoint Route & Controller

#### `POST /api/v1/payments/create-intent`
**Request Body:**
```json
{
  "bookingId": "6710abcd1234ef5678901234"
}
```
**Controller Logic:**
1. Retrieve `Booking`. Calculate the 20% deposit.
2. Find or create a Stripe Customer for `req.user.email`.
3. Call `createInitialPaymentIntent(...)`.
4. Create a pending `Payment` record with `stripePaymentIntentId: paymentIntent.id`.
5. Return:
```json
{
  "success": true,
  "data": {
    "clientSecret": "pi_3MtwLw2eZvKYlo2C..._secret_...",
    "paymentIntentId": "pi_3MtwLw2eZvKYlo2C...",
    "customerId": "cus_Q...",
    "amount": 35.00
  }
}
```

---

## 2. Frontend Integration (Web & Mobile)

### Web (React / Next.js)
The frontend uses `@stripe/react-stripe-js` and `@stripe/stripe-js`:

```tsx
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { loadStripe } from '@stripe/stripe-js'

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

export function CheckoutForm({ clientSecret }: { clientSecret: string }) {
  return (
    <Elements stripe={stripePromise} options={{ clientSecret }}>
      <PaymentForm />
    </Elements>
  )
}

function PaymentForm() {
  const stripe = useStripe()
  const elements = useElements()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!stripe || !elements) return

    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/booking/confirmation`,
      },
    })

    if (error) {
      console.error(error.message)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {/* Renders Apple Pay button, Google Pay button, or Card fields depending on browser */}
      <PaymentElement options={{ layout: 'tabs' }} />
      <button type="submit" disabled={!stripe}>Pay Deposit</button>
    </form>
  )
}
```

### Mobile (React Native / Expo)
Use `@stripe/stripe-react-native`:
1. Call `initPaymentSheet({ paymentIntentClientSecret, customerId, customerEphemeralKeySecret, merchantDisplayName: 'Mimilini' })`.
2. Call `presentPaymentSheet()` which automatically brings up native Apple Pay / Google Pay / Card sheet.

---

## 3. Stripe Webhook Processing

In your `/api/v1/stripe/webhook` handler, listen for:

### 1. `payment_intent.succeeded`
```typescript
const paymentIntent = event.data.object as Stripe.PaymentIntent
const { bookingId, paymentType } = paymentIntent.metadata

if (paymentType === 'INITIAL_20') {
  // 1. Mark Payment document as SUCCEEDED
  // 2. Save paymentIntent.payment_method to Booking.stripePaymentMethodId
  // 3. Update Booking.status = 'initial_paid'
  // 4. Update Booking.initialPayment.status = 'captured'
} else if (paymentType === 'BALANCE_80') {
  // 1. Mark Payment document as SUCCEEDED
  // 2. Update Booking.status = 'paid'
  // 3. Update Booking.balancePayment.status = 'captured'
}
```

### 2. `payment_intent.payment_failed`
```typescript
// If 80% balance off-session charge fails:
// 1. Update Booking.status = 'balance_payment_failed'
// 2. Set Booking.balancePayment.rectificationDeadline = now + 4 hours
// 3. Send SMS/Email notification to client with a "Pay Now" link
```

---

## 4. Requirements to Go Live with Apple Pay & Google Pay

1. **Google Pay:**
   - Works automatically in Stripe Test Mode and Live Mode with `automatic_payment_methods: { enabled: true }`.
2. **Apple Pay:**
   - Requires HTTPS on your website domain.
   - You must register your domain in the **Stripe Dashboard > Settings > Payment Methods > Apple Pay**.
   - Host the domain verification file at:
     `https://yourdomain.com/.well-known/apple-developer-merchantid-domain-association`
   - For iOS Apps: enable the Apple Pay entitlement and add your Merchant ID in Apple Developer Console.
