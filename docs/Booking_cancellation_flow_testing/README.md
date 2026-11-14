# Mimilini Booking Platform — Booking Cancellation Flow Testing Guide

> **Base URL:** `http://localhost:8080/api/v1`  
> **Auth Header:** `Authorization: Bearer {{token}}`

Every possible stage and role-based cancellation scenario in the Mimilini platform is documented separately inside this folder with exact API serials, request payloads, negative test cases, and database/Stripe/Wallet verification checklists.

---

## 📋 Index of All Cancellation Flows

| # | Flow Name | Trigger Role | Booking Stage | Document |
|---|---|---|---|---|
| 01 | Customer Cancels Before Payment | Customer | `requested` / `accepted` (unpaid) | [01_CUSTOMER_CANCEL_BEFORE_PAYMENT.md](./01_CUSTOMER_CANCEL_BEFORE_PAYMENT.md) |
| 02 | Customer Early Cancellation (>24h) | Customer | `confirmed` (20% or 100% paid) | [02_CUSTOMER_CANCEL_EARLY_OVER_24H.md](./02_CUSTOMER_CANCEL_EARLY_OVER_24H.md) |
| 03 | Customer Late Cancellation (<24h) | Customer | `confirmed` (20% or 100% paid) | [03_CUSTOMER_CANCEL_LATE_UNDER_24H.md](./03_CUSTOMER_CANCEL_LATE_UNDER_24H.md) |
| 04 | Professional Declines Request | Professional | `requested` | [04_PROFESSIONAL_DECLINE_REQUEST.md](./04_PROFESSIONAL_DECLINE_REQUEST.md) |
| 05 | Professional Cancels Booking (>48h & <48h) | Professional | `confirmed` / `accepted` | [05_PROFESSIONAL_CANCEL_CONFIRMED_PENALTY.md](./05_PROFESSIONAL_CANCEL_CONFIRMED_PENALTY.md) |
| 06 | System Auto-Cancel: 1-Hour Deposit Timeout | System Cron | `accepted` (unpaid > 1h) | [06_SYSTEM_AUTO_CANCEL_1H_DEPOSIT_TIMEOUT.md](./06_SYSTEM_AUTO_CANCEL_1H_DEPOSIT_TIMEOUT.md) |
| 07 | Admin Cancel & In-Progress Protection | Admin / Negative | `in_progress` | [07_ADMIN_CANCEL_AND_IN_PROGRESS_BLOCK.md](./07_ADMIN_CANCEL_AND_IN_PROGRESS_BLOCK.md) |
| 08 | System Auto-Cancel: 80% Balance Timeout | System Cron | `confirmed` (balance failed > 2h) | [08_SYSTEM_AUTO_CANCEL_BALANCE_TIMEOUT.md](./08_SYSTEM_AUTO_CANCEL_BALANCE_TIMEOUT.md) |

---

## 🎨 Low-Fidelity UI/UX Design Specifications

Wireframes, user flows, confirmation modals, warning banners, and notification text mappings for the frontend web and mobile teams:

- 👤 **Customer Flow:** [LOW_FIDELITY_CUSTOMER_CANCELLATION_FLOW.md](./LOW_FIDELITY_CUSTOMER_CANCELLATION_FLOW.md)
- 💄 **Professional / Artist Flow:** [LOW_FIDELITY_ARTIST_CANCELLATION_FLOW.md](./LOW_FIDELITY_ARTIST_CANCELLATION_FLOW.md)

---

## ⚖️ Quick Policy Comparison Matrix

| Cancellation Scenario | Refund / Wallet Credit | Artist Penalty | Artist Account | Slot Freed? |
|---|---|---|---|---|
| **Customer Pre-Payment Cancel** | None (No money charged) | No | Active | Yes |
| **Customer Cancel (>24h)** | Platform Credit (`Paid - Stripe Fee`) | No | Active | Yes |
| **Customer Cancel (<24h, 20% paid)** | $0 (20% deposit forfeited) | No | Active | Yes |
| **Customer Cancel (<24h, 100% paid)** | 50% of Artist Net Payout (Wallet Credit) | No (Artist gets 50% Net Payout) | Active | Yes |
| **Professional Declines Request** | None (No money charged) | No | Active | Yes |
| **Professional Cancel (>48h)** | Platform Credit (`Paid - Stripe Fee`) | **Yes** (`isPenaltyRequired: true`) | Hidden from discovery | Yes |
| **Professional Cancel (<48h)** | Platform Credit (`Paid - Stripe Fee`) | **Yes** (`isPenaltyRequired: true`) | **SUSPENDED** | Yes |
| **1h Deposit Timeout (Cron)** | None (No money charged) | No | Active | Yes |
| **2h Balance Timeout (Cron)** | Platform Credit (`20% Deposit - Stripe Fee`) | No | Active | Yes |
| **During `in_progress`** | Blocked for Customer/Pro; Admin Only | Admin discretion | Active | Yes (if Admin) |

---

## 🔑 Postman Environment Variables Needed

| Variable | Description |
|---|---|
| `baseUrl` | `http://localhost:8080/api/v1` |
| `customerToken` | JWT token of Customer account |
| `artistToken` | JWT token of Professional account |
| `adminToken` | JWT token of Admin / Super Admin account |
| `artistId` | Professional's User `_id` |
| `serviceId` | Active Service `_id` belonging to the professional |
| `addressId` | Customer's saved Address `_id` |
| `paymentMethodId` | Saved Stripe Payment Method (`pm_...`) or MongoDB `_id` |
| `bookingId` | Captured dynamically from `POST /bookings` response |

