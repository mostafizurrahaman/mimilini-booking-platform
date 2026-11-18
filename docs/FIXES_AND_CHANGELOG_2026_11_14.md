# Mimilini Platform — Daily Fixes & Improvements Changelog

> **Date:** 14 November 2026  
> **Branch:** `dev-mostafiz`  
> **Compiler / Verification Status:** TypeScript Clean (`tsc --noEmit` exit code 0)

---

## 📌 Summary of Issues Addressed & Resolved Today

Today's focus was on **Real-time UX synchronization**, **Booking Cancellation Policy overhaul**, **Data Privacy / Role Separation between Customer & Professional**, **Customer-Friendly Terminology standardization**, **Pending Invoices / Stripe Checkout Enum Formatting**, and **Low-Fidelity UI/UX Architecture**.

---

### 1. ⚡ Real-Time Booking Status Updates (No Manual Screen Refresh)
* **Problem:** When a professional accepted a booking or a status changed (confirmed, completed, cancelled, declined), neither the customer nor the professional saw the updated status in real time. They had to manually refresh their browser/app.
* **Root Cause:** Status transitions mutated the database without broadcasting real-time socket events to user channels.
* **Fix Applied:**
  * Implemented `booking:status_update` socket event dispatcher in `apps/server/src/app/modules/Chat/chat.socket.ts`.
  * Connected real-time status broadcasting to all key milestone lifecycle events in:
    * `booking.services.ts` (accept, decline, cancel, complete, sign-off).
    * `booking.jobs.ts` (1-hour deposit timeout & 2-hour balance rectification timeout).
  * Frontend can now listen to `booking:status_update` and instantly re-render UI state without page reloads.

---

### 2. 🛡️ Data Privacy & Role Separation in Cancellation Flows
* **Problem:** Customer and Professional messages leaked internal financial and penal details to the opposite party:
  * Professionals were seeing customer wallet balances, credit amounts, and processing fees.
  * Customers were seeing internal artist penalties, profile visibility restrictions, and account suspension notices.
* **Fix Applied:**
  * **Customer Side:** Customer now only sees their own refund and platform credit details (`"Your booking was cancelled by Naz. A full refund of $... Platform Credit has been credited to your wallet."`). Internal artist penalties and suspensions are 100% hidden.
  * **Professional Side:** Professional only sees their own penalty status, profile visibility status, account suspension, or compensation payout share (`"Sarah Jenkins cancelled within 24 hours. You received 50% compensation payout ($... AUD)."`). Customer credit/refund figures are never shown to the professional.
  * Updated `recordBookingHistory` and role-based milestone message generator `getTimelineRoleMessages` in `booking.services.ts`.

---

### 3. 🏷️ User-Facing Terminology Standardization ("Platform processing fee")
* **Problem:** User-facing notifications, API messages, and booking timeline descriptions referred to "Stripe processing fee" and "transaction fee", which was confusing and unbranded for end-users.
* **Fix Applied:**
  * Systematically replaced all customer/artist-facing references to "Stripe processing fee" or "transaction fee" with **"Platform processing fee"**.
  * Applied across `booking.services.ts`, `booking.jobs.ts`, timeline logs, and wallet ledger descriptions.

---

### 4. ⏱️ Cancellation Timeframe Clarity & Abbreviation Removal
* **Problem:** Cancellation messages contained abbreviated shorthand like `(<24h)` or `(<48h)` which lacked professionalism and clarity.
* **Fix Applied:**
  * Replaced all occurrences of `(<24h)` and `(<48h)` with explicit English terminology:
    * **Within 24 Hours of Appointment** (Customer late cancellation).
    * **More Than 24 Hours in Advance** (Customer standard cancellation).
    * **Within 48 Hours of Appointment** (Professional last-moment cancellation with account suspension).
    * **Between 48 Hours and 7 Days** (Professional cancellation with penalty & hidden profile).
    * **Between 7 and 13 Days** (Professional cancellation with penalty & hidden profile).
    * **More than 14 Days in Advance** (Professional cancellation; zero penalty for Low budget).

---

### 5. 💳 Pending Invoices & Stripe Checkout 'sevenTo13Days' Text Formatting
* **Problem:** When an artist viewed pending penalty invoices or opened Stripe Checkout to pay an outstanding penalty, the raw technical camelCase enum key `sevenTo13Days` was displayed on screen and above payment options ('Link' and 'Klarna').
* **Root Cause:**
  * `penalty.services.ts` passed `${penalty.timeframeTier}` directly into the Stripe Checkout line item description without formatting.
  * `getMyPenalties` and `getAllPenalties` returned raw database enum values to the frontend.
* **Fix Applied:**
  * Created `formatTimeframeTier` helper in `apps/server/src/app/modules/Penalty/penalty.services.ts`.
  * Stripe Checkout line items now render clean text: `Timeframe: 7 to 13 Days`, `Within 48 Hours`, or `More than 14 Days`.
  * `getMyPenalties` and `getAllPenalties` now return formatted strings (`timeframeTier: "7 to 13 Days"`), while retaining raw keys for any internal logic (`timeframeTierRaw: "sevenTo13Days"`).

---

### 6. 🎨 Low-Fidelity UI/UX Design Specifications
* **Deliverable:** Created complete low-fidelity architectural wireframes, ASCII layouts, user journeys, confirmation modals, warning banners, and text mapping guides for the frontend team.
* **Created Files:**
  1. [`docs/Booking_cancellation_flow_testing/LOW_FIDELITY_CUSTOMER_CANCELLATION_FLOW.md`](./Booking_cancellation_flow_testing/LOW_FIDELITY_CUSTOMER_CANCELLATION_FLOW.md)
     * Covers Screen 1 (Booking Details), Screen 2A (Early Cancel Modal >24h), Screen 2B (Late Cancel Modal <24h with policy checkbox), Screen 3 (Post-Cancel Wallet Screen), and Notification mappings.
  2. [`docs/Booking_cancellation_flow_testing/LOW_FIDELITY_ARTIST_CANCELLATION_FLOW.md`](./Booking_cancellation_flow_testing/LOW_FIDELITY_ARTIST_CANCELLATION_FLOW.md)
     * Covers Screen 1 (Appointment Details), Screen 2A (<48h Critical Suspension Modal), Screen 2B (7-13d & 48h-7d Warning Modal), Screen 2C (>14d Zero Penalty Modal), Screen 3 (Post-Cancel Sticky Banners), Screen 4 (Penalty Settlement Modal), and Multi-Tier Matrix.
  3. Linked both documents into [`docs/Booking_cancellation_flow_testing/README.md`](./Booking_cancellation_flow_testing/README.md).

---

### 7. 🔍 Audits & Investigations Conducted
* **Professional Availability Audit:** Investigated Professional Naz (`6ae8375946c823fc6151ca79`) regarding Thursday, Friday, and Saturday availability vs customer view, examining blocked dates, active schedule slots, and UTC timezone offsets.
* **Penalty System Visibility Audit:** Traced and verified how unresolved penalties impact professional discovery across the platform (`isPenaltyRequired: true` hiding artist profile from search; `<48h` triggering hard user status `AuthStatus.SUSPENDED`).

---

## 📁 Modified Files Summary

| File Path | Description of Changes |
|---|---|
| `apps/server/src/app/modules/Booking/booking.services.ts` | Replaced "Stripe processing fee" with "Platform processing fee"; eliminated cross-role data leaks; expanded timeframes into clear English text; integrated real-time socket events. |
| `apps/server/src/app/jobs/booking.jobs.ts` | Replaced "Stripe fee" with "Platform processing fee" in automated cron cancellations; emitted `booking:status_update` socket events on deposit & balance timeouts. |
| `apps/server/src/app/modules/Penalty/penalty.services.ts` | Added `formatTimeframeTier` helper; converted raw camelCase keys (`sevenTo13Days`, `within48Hours`, `moreThan14Days`) to human-readable strings for Stripe Checkout and API responses. |
| `docs/Booking_cancellation_flow_testing/LOW_FIDELITY_CUSTOMER_CANCELLATION_FLOW.md` | New low-fidelity wireframe guide for customer cancellation UI/UX. |
| `docs/Booking_cancellation_flow_testing/LOW_FIDELITY_ARTIST_CANCELLATION_FLOW.md` | New low-fidelity wireframe guide for professional cancellation UI/UX. |
| `docs/Booking_cancellation_flow_testing/README.md` | Updated testing index and linked UI/UX design specifications. |
