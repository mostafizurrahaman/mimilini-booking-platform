# 📋 Booking Lifecycle, Invoicing, GST & 80% Payment Holding Specification

> **Legal & Regulatory References:**
> - [Chosen approach (1).pdf](file:///c:/Users/Mostafizur%20Rahaman/Desktop/tss_workspace/mimilini-booking-platform/docs/Chosen%20approach%20(1).pdf)
> - [Customer Terms and conditions.pdf](file:///c:/Users/Mostafizur%20Rahaman/Desktop/tss_workspace/mimilini-booking-platform/docs/Customer%20Terms%20and%20conditions.pdf)
> - [Professional Terms and conditions.pdf](file:///c:/Users/Mostafizur%20Rahaman/Desktop/tss_workspace/mimilini-booking-platform/docs/Professional%20Terms%20and%20conditions.pdf)
> - Platform Settings Schema: [platform-settings.model.ts](file:///c:/Users/Mostafizur%20Rahaman/Desktop/tss_workspace/mimilini-booking-platform/packages/db/src/apps/modules/PlatformSettings/platform-settings.model.ts)
> - Platform Settings Constants: [platform-settings.constants.ts](file:///c:/Users/Mostafizur%20Rahaman/Desktop/tss_workspace/mimilini-booking-platform/packages/db/src/apps/modules/PlatformSettings/platform-settings.constants.ts)
> - Platform Operator: **STUNNER ALERT PTY LTD** (ABN 88 701 443 129)

---

## 1. How Booking Works

### 1.1 Dual-Contract Model (Electronic Distribution Platform - EDP)
STUNNER ALERT operates as an **Electronic Distribution Platform (EDP)** under Australian law and ATO rules:
1. **Contract 1 (Platform Services):** Customer $\leftrightarrow$ STUNNER ALERT for booking facilitation, discovery, and payment collection. STUNNER ALERT is merchant of record *only* for the 20% marketplace facilitation fee.
2. **Contract 2 (Service Contract):** Customer $\leftrightarrow$ Independent Professional (Artist). The artist is the independent supplier and merchant of record for the beauty/styling services.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        CUSTOMER (CLIENT)                               │
└──────────────┬─────────────────────────────────────────┬───────────────┘
               │                                         │
    Contract 1: Platform Services             Contract 2: Service Contract
    (Booking Fee & Payment Facilitation)      (Beauty & Styling Delivery)
               │                                         │
               ▼                                         ▼
┌──────────────────────────────┐          ┌──────────────────────────────┐
│     STUNNER ALERT PTY LTD    │          │   INDEPENDENT PROFESSIONAL   │
│  (Platform / Payment Agent)  │          │   (Artist / Supplier of Svc) │
└──────────────────────────────┘          └──────────────────────────────┘
```

---

### 1.2 End-to-End Booking Lifecycle

```
[ Customer Submits Booking ]
             │
             ▼
[ Booking Confirmed ] ──► Initial Deposit (20%) Charged Immediately
             │            Payment method saved via Stripe ('off_session')
             ▼
[ 24 Hours Before Appointment ] ──► Automated 80% Balance Payment Triggered
             │
             ├──► Payment Succeeded ──► Booking Status: PAID ──► Professional Delivers Service
             │                                                          │
             │                                                          ▼
             │                                                 [ Service Completed ]
             │                                                          │
             │                                                 Stripe Transfer releases
             │                                                 net payout to Professional
             │
             └──► Payment Failed ──► Status: balance_payment_failed
                                           │
                                           ├──► Customer Rectifies (2 to 4 hour window) ──► PAID
                                           │
                                           └──► Window Expires Unpaid ──► Booking Cancelled
                                                                        ──► ATO Adjustment Note Issued
```

1. **Service Selection & Upfront Component Pricing (ACL Compliance):**
   - Customer chooses artist, services, appointment time, and location.
   - Platform displays: Base Service Price, GST (if artist is GST-registered), Travel/Parking Fee (if known), and **Total Booking Price**.
2. **Initial Deposit (20%):**
   - Charged immediately upon booking confirmation via Stripe `PaymentIntent`.
   - Card token is saved on the Stripe `Customer` with `setup_future_usage: 'off_session'` for the upcoming balance charge.
3. **Automated Balance Charge (80%):**
   - Background scheduler (e.g., BullMQ / Agenda) charges the remaining 80% **24 hours prior** to appointment commencement.
   - **Short-Notice Exception:** If booked $< 24$ hours before the appointment time, **100% of Total Booking Price** is charged upfront at confirmation.
4. **24-Hour Failure & Rectification Window:**
   - If off-session 80% payment fails (expired card, insufficient funds):
     - Booking transitions to `balance_payment_failed`.
     - Multi-channel notification (SMS, Push, Email) sends a Stripe **"Pay Now"** link.
     - **Rectification Window:** Customer has **2 to 4 hours** to complete payment.
     - If paid: Status becomes `paid`.
     - If unpaid after deadline: Booking is cancelled, artist's calendar is freed, and an ATO Adjustment Note is issued.

---

## 2. Cancellation Policies & Artist Penalty Matrix

### 2.1 Customer Cancellations
- **Customer cancels $>24$h before:** Amount paid issued as **Platform Credit** (valid 36 months) less reasonable platform admin fee.
- **Customer cancels $<24$h before:** **50% Late Cancellation Fee** charged; remaining 50% issued as 36-month Platform Credit.
- **Customer No-Show / Late $>20$ mins / Safety refusal:** **100% retained** (0% refund/credit); artist payout protected.

---

### 2.2 Artist Cancellation & Fine Matrix (`PlatformSettings`)

When a **Professional (Artist)** cancels a confirmed booking:
1. **Customer Remedy:** Customer receives an immediate **100% full refund** to their payment card (or choice of Platform Credit).
2. **Artist Fine / Penalty:**
   As configured in [platform-settings.model.ts](file:///c:/Users/Mostafizur%20Rahaman/Desktop/tss_workspace/mimilini-booking-platform/packages/db/src/apps/modules/PlatformSettings/platform-settings.model.ts), the artist is charged a fine based on two criteria:
   - **Tier by Booking Amount:**
     - **Low Tier:** Booking Total $\le \$200$ (`lowMaxAmount: 200`)
     - **Medium Tier:** Booking Total $\$201 - \$500$ (`mediumMaxAmount: 500`)
     - **High Tier:** Booking Total $> \$500$
   - **Timeframe Before Appointment:**
     - **> 14 Days prior**
     - **7 to 13 Days prior**
     - **Within 48 Hours (< 48 hours)**

#### Default Cancellation Penalty Schedule:

| Booking Tier | Amount Range (AUD) | > 14 Days Prior | 7 to 13 Days Prior | Within 48 Hours (< 48h) |
| :--- | :--- | :---: | :---: | :---: |
| **Low Tier** | $\le \$200$ | **$0 AUD** | **$15 AUD** | **$30 AUD** |
| **Medium Tier** | $\$201 - \$500$ | **$15 AUD** | **$35 AUD** | **$60 AUD** |
| **High Tier** | $> \$500$ | **$30 AUD** | **$60 AUD** | **$120 AUD** |

#### Penalty Collection via Account Gate & Pay Screen:

Instead of waiting weeks to deduct fines from hypothetical future booking payouts, the platform enforces an immediate **"Account Gate & Pay Screen"**:

```
[ Artist Cancels Confirmed Booking ]
                 │
                 ▼
[ Penalty Calculated via PlatformSettings (e.g. $60.00 AUD) ]
                 │
                 ▼
[ Artist User Status Set to 'penalty_unpaid' / 'restricted' ]
                 │
   • Artist Profile & Booking Privileges immediately locked
   • Calendar deactivated from marketplace search
                 │
                 ▼
[ Artist Opens App / Dashboard ──► Dedicated Lock Screen Displayed ]
                 │
   ┌────────────────────────────────────────────────────────┐
   │ ⚠️ Account Restricted - Penalty Payment Required       │
   │                                                        │
   │ You cancelled Booking #BK-1024 on 14/10/2026 (<48h).   │
   │ Late Cancellation Penalty: $60.00 AUD                  │
   │                                                        │
   │ [ Pay $60 AUD to Reactivate Account (Stripe) ]         │
   └────────────────────────────────────────────────────────┘
                 │
                 ▼
[ Artist Pays via Card directly into STUNNER ALERT Stripe Account ]
                 │
                 ├──► Payment Succeeded ──► Funds settled directly in Platform Account
                 │                      ──► Status reverts to 'active'
                 │                      ──► Booking calendar instantly reactivated
```

#### Key Advantages:
1. **Zero Bad Debt:** Eliminates the risk of an artist cancelling and abandoning the platform with unpaid penalty debt.
2. **Immediate Cash Inflow:** Penalty funds are received directly by STUNNER ALERT's primary merchant balance.
3. **Clean Future Payouts:** Subsequent customer booking payouts remain pristine (20% fee + 10% GST on fee) without complex cross-booking debt reconciliation.
4. **Behavioral Deterrent:** Seeing an immediate account freeze and mandatory payment screen prevents flippant or irresponsible cancellations.

---

## 3. How to Manage Invoices

### 3.1 Two Separate Documents (EDP Compliance)
Because STUNNER ALERT is an EDP and does not supply the hair/makeup service, STUNNER ALERT does not issue an invoice for the total service price in its own name. The billing structure comprises:
1. **Customer Master Invoice (Progressive Payment Invoice):** Issued on behalf of the artist via Stripe `on_behalf_of`.
2. **Platform Facilitation Fee Invoice / RCTI:** Issued by STUNNER ALERT to the artist covering the 20% commission + 10% GST on fee.

---

### 3.2 Customer Master Invoice Breakdown
- **Seller/Supplier:** Professional Name & ABN (noted: *"Issued by STUNNER ALERT PTY LTD as billing agent for [Professional Name]"*).
- **Progressive Payment Terms:**
  - **Total Customer Price:** e.g., `$550.00 AUD` (Base $500 + GST $50)
  - **Deposit Paid at Booking (20%):** `$110.00 AUD` $\rightarrow$ `[PAID via Platform on DD/MM/YYYY]`
  - **Balance Due 24h Prior (80%):** `$440.00 AUD` $\rightarrow$ `[BALANCE OUTSTANDING - Due DD/MM/YYYY at HH:MM]`
- **Post-Payment:** Updated invoice/receipt generated showing `[PAID IN FULL - $550.00 AUD]`.
- **Adjustment Note:** If cancelled, an ATO-compliant **Adjustment Note (Credit Note)** is generated on behalf of the artist.

---

## 4. How to Manage GST (GST Exclusive Model)

Under ATO rules for EDPs, GST applies based on **whether the artist is GST-registered**. Because artists set their prices as **GST Exclusive (Base Rate)** in the platform catalog:

---

### Scenario A: Artist IS Registered for GST (Turnover $> \$75\text{k}$)
- 10% GST is added **ON TOP** of the artist's base price.
- **Example Calculation ($500 AUD base price):**
  - **Artist Base Price:** `$500.00 AUD`
  - **GST on Service (10%):** `+$50.00 AUD`
  - **Total Price for Customer:** **`$550.00 AUD`**
  - **Customer 20% Deposit (Booking):** `$110.00 AUD` (Base $100 + GST $10)
  - **Customer 80% Balance (24h prior):** `$440.00 AUD` (Base $400 + GST $40)
  - **Platform Commission (20% of base $500):** `$100.00 AUD`
  - **GST on Platform Commission (10%):** `$10.00 AUD`
  - **Total Platform Deduction:** `$110.00 AUD`
  - **Artist Net Payout:**
    $$\text{Artist Payout} = \$550.00 (\text{Gross Collected}) - \$110.00 (\text{Platform Deduction}) = \mathbf{\$440.00\text{ AUD}}$$
    *(Artist keeps $400 net for their work and $40 net GST ($50 collected - $10 paid to platform) to remit to the ATO).*

---

### Scenario B: Artist is NOT Registered for GST (Turnover $< \$75\text{k}$, Hobbyist/Sole Trader)
- No GST is added to the service price.
- **Example Calculation ($500 AUD base price):**
  - **Artist Base Price:** `$500.00 AUD`
  - **GST on Service:** `$0.00 AUD` (Invoice states: *"No GST has been charged"*)
  - **Total Price for Customer:** **`$500.00 AUD`**
  - **Customer 20% Deposit (Booking):** `$100.00 AUD`
  - **Customer 80% Balance (24h prior):** `$400.00 AUD`
  - **Platform Commission (20% of base $500):** `$100.00 AUD`
  - **GST on Platform Commission (10%):** `$10.00 AUD` *(Mandatory: STUNNER ALERT is GST registered)*
  - **Total Platform Deduction:** `$110.00 AUD`
  - **Artist Net Payout:**
    $$\text{Artist Payout} = \$500.00 (\text{Gross Collected}) - \$110.00 (\text{Platform Deduction}) = \mathbf{\$390.00\text{ AUD}}$$

---

## 5. How to Hold the 80% Money

### 5.1 Why We Do NOT Use an Upfront Escrow
In Australia, holding customer funds upfront for weeks in a platform account triggers **AFSL (Australian Financial Services Licence)** requirements and client trust fund regulations. 

Progressive charging eliminates this risk:
1. **From Booking to 24 Hours Prior:** Only the 20% deposit is captured. The remaining 80% remains in the customer's own bank account while their card is securely vaulted via Stripe (`off_session`).
2. **24 Hours Prior to Appointment:** The 80% balance is charged into the platform's Stripe balance (`transfer_group: 'booking_<id>'`).
3. **Holding Window (24h prior until completion):** The funds sit safely in the platform balance. Payout to the artist is held until service delivery.
4. **Post-Completion Payout:** Once the appointment is completed, the platform executes `stripe.transfers.create` for the net payout ($440 or $390 AUD) to the artist's connected account.

---

## 6. Comprehensive Summary Matrix ($500 Base Price)

| Metric | Artist GST-Registered (Exclusive) | Artist NOT GST-Registered |
| :--- | :--- | :--- |
| **Artist Base Price** | `$500.00 AUD` | `$500.00 AUD` |
| **Service GST (10%)** | `+$50.00 AUD` | `$0.00 AUD` (No GST) |
| **Total Customer Price** | **`$550.00 AUD`** | **`$500.00 AUD`** |
| **Deposit at Booking (20%)** | `$110.00 AUD` | `$100.00 AUD` |
| **Balance Due at 24h (80%)** | `$440.00 AUD` | `$400.00 AUD` |
| **Platform Commission (20%)** | `$100.00 AUD` | `$100.00 AUD` |
| **GST on Platform Fee (10%)** | `$10.00 AUD` | `$10.00 AUD` |
| **Total Platform Deduction** | **`$110.00 AUD`** | **`$110.00 AUD`** |
| **Artist Net Payout** | **`$440.00 AUD`** *(less Stripe fee)* | **`$390.00 AUD`** *(less Stripe fee)* |
| **Artist Cancellation Fine** | Tiered by `PlatformSettings`: Low ($0–$30), Med ($15–$60), High ($30–$120) | Tiered by `PlatformSettings`: Low ($0–$30), Med ($15–$60), High ($30–$120) |
| **Fine Settlement** | Account status set to `penalty_unpaid` $\rightarrow$ must pay fine on screen to unlock | Account status set to `penalty_unpaid` $\rightarrow$ must pay fine on screen to unlock |
