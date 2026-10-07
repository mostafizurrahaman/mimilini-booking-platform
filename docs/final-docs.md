# 📖 Product Specification & Context Document: **memillennial**

---

## 1. Executive Platform Context & Overview

**memillennial** is an Australian, high-trust beauty and personal care marketplace and SaaS ecosystem connecting **Clients (Customers)** with **Vetted Independent Beauty Professionals (Artists)**—including makeup artists, hair stylists, lash/nail technicians, and estheticians—governed by a centralized **Super Admin Operations Panel**.

```
                               ┌───────────────────────────────┐
                               │   memillennial Eco-System    │
                               └──────────────┬────────────────┘
                                              │
         ┌────────────────────────────────────┼────────────────────────────────────┐
         ▼                                    ▼                                    ▼
┌──────────────────┐                ┌──────────────────┐                ┌──────────────────┐
│   Customer App   │ ◄─── Bookings, ──► │    Artist App    │ ◄── Financials,─► │   Admin Panel    │
│ (iOS/Android/Web)│      Reviews,      │ (iOS/Android/Web)│     Governance,   │   (Desktop Web)  │
│                  │      Messages      │                  │     Compliance    │                  │
└──────────────────┘                └──────────────────┘                └──────────────────┘
```

### Key Localization & Compliance Standards

- **Market:** Australia (AUD currency, AEST timezone support, metric travel radius in km).
- **Identity & Business Validation:** Automated & manual **Australian Business Number (ABN)** validation, **Australian Driver Licence** verification, and **Public Liability Insurance ($10M)** checks.
- **Privacy & Security:** Secure document storage (AES-256 encrypted) adhering to the **Australian Privacy Act 1988**.
- **Financial Infrastructure:** Multi-gateway processing (Stripe, Apple Pay, Google Pay, PayPal, Credit/Debit Cards) with automated commission splitting (15% default platform fee) and digital wallet compensation.

---

## 2. Complete Features List by User Story Document

---

### MODULE 1: Authentication, Onboarding & KYC Compliance

#### 1.1 Multi-Role Authentication & Access Control

- **US-1.1.1 (Role Selection):** _As a new visitor_, I want to choose my onboarding journey (**"Customer"** to book beauty services or **"Artist"** to grow my business), so that the application routes me to the relevant registration flow.
- **US-1.1.2 (Email & Password Authentication):** _As a user (Customer/Artist/Admin)_, I want to sign up or log in securely using my email and password with options for "Remember Me" and "Forgot Password" via email OTP.
- **US-1.1.3 (OTP Verification):** _As a newly registered user_, I want to receive a 6-digit numeric OTP via email within 5 minutes to verify my email address before accessing the platform.
- **US-1.1.4 (Role-Based Access Gates):** _As the system_, I want to prevent artists with incomplete profiles or unapproved KYC statuses from accepting client bookings until approved by an administrator.

#### 1.2 Artist 3-Step Professional Registration & KYC

- **US-1.2.1 (Step 1 - Business Registration):** _As an artist_, I want to enter my registered Business Name, Australian Mobile Number (`04XX XXX XXX`), Australian Business Number (ABN), physical studio address, and years of professional experience.
- **US-1.2.2 (Step 2 - Identity & Document Upload):** _As an artist_, I want to upload high-resolution images/PDFs of my **Driver Licence (Front & Back)** along with a live **Verification Selfie** holding my licence, backed by a clear privacy disclosure citing the _Australian Privacy Act 1988_.
- **US-1.2.3 (Step 3 - Profile & Geolocation Setup):** _As an artist_, I want to add my professional bio (up to 500 characters), profile photo, social links (Instagram, Facebook, Website), spoken languages, and operating **Travel Radius (e.g., 5 km to 50 km)** with geolocation coordinates.
- **US-1.2.4 (Certifications & Product Registry):** _As an artist_, I want to tag up to 20 certifications (e.g., _MAC Pro Certified, CIDESCO Diploma, Airbrush Certified_) and list preferred professional skincare/makeup brands (e.g., _Charlotte Tilbury, NARS_) to build trust with sensitive-skin clients.

---

### MODULE 2: Service Catalog & Visual Portfolio Management

- **US-2.1 (Service Catalog CRUD):** _As an artist_, I want to create, edit, deactivate, or delete services specifying Category (_Bridal, Hair, Nails, Lashes, Facial_), Description, Duration (minutes/hours), Base Price (AUD), Travel Fee, and promotional discount flags.
- **US-2.2 (Service Badges):** _As an artist_, I want to toggle **Popular** and **Featured** badges on my top-selling services to guide client decision-making.
- **US-2.3 (Visual Portfolio & Before/After Gallery):** _As an artist_, I want to upload up to 20 portfolio photos, tag them with **"Before"** and **"After"** badges, and confirm that all client photos have consent before publishing.
- **US-2.4 (Full-Screen Image Viewer):** _As a client or artist_, I want to tap on any portfolio photo to view it in full-screen modal resolution.

---

### MODULE 3: Availability Engine, Schedules & Smart Booking Rules

- **US-3.1 (Weekly Working Schedule):** _As an artist_, I want to configure my working hours for each day of the week (Monday through Sunday) with custom start times, end times, and multiple daily break intervals.
- **US-3.2 (Interactive Monthly Calendar):** _As an artist_, I want to view a monthly calendar with color-coded day markers indicating:
  - 🟢 **Available:** Ready for bookings.
  - 🔴 **Booked:** Confirmed appointments.
  - 🟣 **Blocked:** Dates blocked for personal leave.
  - 🟡 **Vacation:** Scheduled out-of-office period.
- **US-3.3 (Date Blocking Engine):** _As an artist_, I want to block single or multiple dates by selecting a reason (_Holiday, Personal Work, Medical Leave, Private Event, Other_) with custom notes.
- **US-3.4 (Vacation Mode):** _As an artist_, I want to toggle Vacation Mode with defined Start/End dates and a custom client out-of-office banner (e.g., _"Away: Tue, Jul 21 – Sat, Jul 25. Taking a summer break!"_), automatically hiding my profile from new search queries.
- **US-3.5 (Quick / Instant Booking Automation):** _As an artist_, I want to configure automated booking rules:
  - **Toggle Quick Booking:** Allow instant client confirmations without manual artist review.
  - **Minimum Notice:** Set lead time required before appointments (e.g., 2 hours).
  - **Booking Buffer:** Automatically enforce cooldown padding between appointments (e.g., 30 minutes).
  - **Max Bookings / Day:** Enforce a hard ceiling on daily capacity (e.g., maximum 8 slots).

---

### MODULE 4: Customer Discovery, Inspiration & Search

- **US-4.1 (Omni-Search Engine):** _As a customer_, I want to search for beauty experts by specifying:
  1. **Location:** City/suburb selection (Sydney NSW, Melbourne VIC, Brisbane QLD, etc.) or GPS current location.
  2. **Date & Time:** Preferred calendar date and appointment time.
  3. **Service Category:** Hair styling, Bridal makeup, Lashes, Nails, Facials, etc.
  4. **Guest Count:** Number of people needing services (1 to 10+ guests).
- **US-4.2 (Discovery Filter & Sort):** _As a customer_, I want to filter artists by distance radius (5 km, 10 km, 20 km, 50 km) and sort by _Nearest, Highest Rated, Available Today,_ or _Lowest Price_.
- **US-4.3 (Artist Card Previews):** _As a customer_, I want each artist search result card to display their profile photo, starting price (`From $XX`), rating, total reviews, distance (`X.X km`), travel radius, badges (_Verified, Available Today, Top Rated_), and thumbnail portfolio carousels.
- **US-4.4 (Customer Stories & Interactive Slider):** _As a customer_, I want to browse verified wedding/event testimonials and interact with a **Draggable Before-and-After Comparison Slider** to evaluate the artist's real-world transformation skills.
- **US-4.5 (Beauty Inspiration Moodboards):** _As a customer_, I want to view curated inspiration galleries categorized by occasion (_Wedding, Formal, Natural, Party, Luxury Glam, Festival_).

---

### MODULE 5: Booking Configuration, Pricing & Checkout

- **US-5.1 (Visit Type Selection):** _As a customer_, I want to choose whether the service will take place as a **Home Visit (Mobile to my location)** or at the **Artist's Home Studio/Salon**.
- **US-5.2 (Custom Consultation Notes):** _As a customer_, I want to enter specialized instructions (e.g., sensitive skin, allergy alerts, vegan-only product requirements, ceremony timeline constraints).
- **US-5.3 (Transparent Pricing Ledger):** _As a customer_, I want to see an itemized checkout receipt showing:
  $$\text{Grand Total} = \text{Service Subtotal} + \text{Travel Fee} - \text{Promo Discount}$$
- **US-5.4 (Payment Options):** _As a customer_, I want to pay using Apple Pay, Google Pay, PayPal, saved Credit/Debit cards, or In-App Wallet Credit balances.
- **US-5.5 (Interactive 3D Card Management):** _As a customer_, I want to add and save credit cards with an interactive 3D flipping card preview, CVV protection, and "Set as Default" toggle.

---

### MODULE 6: Booking Lifecycle, Job Execution & Digital Sign-Off

```
[ Customer Books ] ──► [ Artist Reviews / Instant Confirms ] ──► [ Service Delivered ]
                                                                        │
┌───────────────────────────────┐     ┌────────────────────────┐        ▼
│ Invoice Generated & Payout Log│ ◄── │ Customer Digital Sign- │ ◄── [ Job Completion ]
│                               │     │ off & Photo Proofs     │     (Time & Products)
└───────────────────────────────┘     └────────────────────────┘
```

- **US-6.1 (Artist Booking Request Inspector):** _As an artist_, I want to inspect booking requests with client profile stats (repeat customer badge, past booking count, rating), travel fee calculations, and an **Automated Schedule Conflict Checker** before clicking **Accept**, **Reschedule**, or **Decline**.
- **US-6.2 (Live Status Stepper):** _As a customer and artist_, I want real-time timeline tracking:
  $$\text{Requested} \longrightarrow \text{Confirmed} \longrightarrow \text{Paid} \longrightarrow \text{In Progress} \longrightarrow \text{Completed}$$
- **US-6.3 (Job Completion Form):** _As an artist_, upon finishing an appointment, I want to:
  - Log actual working duration (e.g., 2h 45m).
  - Record actual products used (e.g., _Charlotte Tilbury, MAC_).
  - Upload up to 6 photo proofs of the finished look.
  - Add internal completion notes.
- **US-6.4 (On-Screen Customer Signature):** _As an artist_, I want the client to provide a digital signature directly on my mobile screen to legally confirm service delivery before marking the job as complete.

---

### MODULE 7: Rescheduling, Cancellations & 48-Hour Refund Engine

- **US-7.1 (Standard 48-Hour Cancellation Rule):** _As a customer_, I want full transparency on platform refund eligibility:
  - **$\ge$ 48 Hours Before Appointment:** Eligible for a 100% full refund of service fees.
  - **$<$ 48 Hours Before Appointment:** Subject to late cancellation fee or non-refundable terms per platform policy.
- **US-7.2 (Customer Cancellation Request):** _As a customer_, I want to cancel an appointment by selecting a reason (_Change of mind, Emergency, Health issue, Found another artist, Other_) and monitor the automated refund tracking pipeline (5–7 business days).
- **US-7.3 (Artist-Initiated Reschedule):** _As an artist_, if an unexpected conflict occurs, I want to propose a new date/time with an apology note; the customer can then tap **"Accept New Schedule"** or **"Decline"**.
- **US-7.4 (Artist-Initiated Cancellation & Compensation):** _As a customer_, if an artist cancels due to an emergency:
  - I receive an immediate 100% refund notification.
  - An automated **$15 AUD Wallet Compensation Credit** is deposited into my account.
  - The system provides a 1-tap shortcut to **"Find Similar Artists"**.

---

### MODULE 8: In-App Communication & Real-Time Consultation

- **US-8.1 (Contextual Linked Chat):** _As a customer or artist_, I want to open a 1:1 chat that has the active **Booking ID & Appointment Date pinned to the top header** for clear context.
- **US-8.2 (Pre-Service Consultation & Attachments):** _As a customer_, I want to share inspiration photos and discuss skin sensitivities, and _as an artist_, I want to share moodboards and preparation guidelines.
- **US-8.3 (Quality Assurance & Compliance Disclaimer):** _As the platform_, I want all chats to display a compliance banner stating: _"Chats are monitored to ensure quality assurance, security, and regulatory compliance."_

---

### MODULE 9: Customer Reviews & Social Feedback

- **US-9.1 (Multidimensional Review Submission):** _As a customer_, after a completed booking, I want to:
  - Award a 1 to 5-star rating.
  - Select positive attribute chips: _Friendly, Professional, Punctual, Hygienic, Great Comm., Skilled, Attentive, Good Vibes, Well Equipped_.
  - Write a detailed testimonial.
  - Upload before/after photos (up to 6 images).
- **US-9.2 (Artist Review Display):** _As an artist_, I want client reviews and badges displayed on my public profile to boost my ranking and booking conversions.

---

### MODULE 10: Customer CRM, Address Book & Preferences

- **US-10.1 (Customer Address Book):** _As a customer_, I want to save multiple addresses (_Home, Work, Mum's Place_) with unit numbers, suburbs, postcodes, and a "Default" toggle.
- **US-10.2 (Saved Artists / Favorites):** _As a customer_, I want to bookmark favorite artists by clicking a heart icon on their card and quickly rebook them from my profile.
- **US-10.3 (Beauty Preferences Customizer):** _As a customer_, I want to maintain my personal style tags (_Natural Makeup, Bold Lashes, Gel Nails, Hair Colour, Brow Shaping, Skincare_) on my profile.
- **US-10.4 (Financial Ledger & Receipts):** _As a customer_, I want to view my historical debits, wallet top-ups, refunds, and download official PDF receipts for every booking.
- **US-10.5 (Support & Incident Ticketing):** _As a customer or artist_, I want to submit support tickets with category selectors (_Booking Issue, Payment Problem, Artist Issue, Technical Bug, Other_), descriptions, and screenshot attachments during Australian business hours (AEST).

---

### MODULE 11: Marketing Engine, Promotions & Campaigns

- **US-11.1 (Artist Promotion Creator):** _As an artist_, I want to create customized promotions with:
  - Promo Code (e.g., `GLOW20`, `LOYAL15`).
  - Discount Type (% or Fixed AUD amount).
  - Minimum Booking Spend threshold.
  - Maximum Usage Limits and Date Ranges.
  - Target Eligibility (_All Clients, Repeat Clients Only, Group Bookings_).
- **US-11.2 (Promo Management):** _As an artist_, I want to monitor active, scheduled, and expired campaigns and pause or delete them at any time.

---

### MODULE 12: Financial Governance, Commission & Wallets

- **US-12.1 (Automated Commission Split Engine):** _As the platform_, upon successful booking completion, I want the system to calculate:
  $$\text{Platform Fee} = \text{Gross Amount} \times 15\%$$
  $$\text{Artist Net Payout} = \text{Gross Amount} - \text{Platform Fee}$$
- **US-12.2 (Artist Payouts & Banking):** _As an artist_, I want to link my Australian bank account (e.g., NAB) and initiate withdrawals (minimum threshold $500 AUD) with full approval tracking.
- **US-12.3 (Customer Wallet Ledger):** _As a customer_, I want an in-app digital wallet that holds promotional credits, compensation payouts, and refunds for instant checkout redemptions.

---

### MODULE 13: Super Admin Operations & Control Center

```
┌───────────────────────────────────────────────────────────────────────────────┐
│                             SUPER ADMIN CONTROL                               │
├────────────────────┬────────────────────┬───────────────────┬─────────────────┤
│ Verification & KYC │ Booking Oversight  │ Financial Control │ Review & CMS    │
│ • Driver License   │ • Live Monitoring  │ • Commission %    │ • Moderation    │
│ • ABN Real-time    │ • Dispute Action   │ • Payout Limits   │ • Push/Email    │
│ • $10M Insurance   │ • Split Ledger     │ • Refund Override │ • Categories    │
└────────────────────┴────────────────────┴───────────────────┴─────────────────┘
```

- **US-13.1 (Executive Dashboard & Real-Time KPIs):** _As a Super Admin_, I want to monitor platform health metrics: Total Users, Total Artists, Pending Verifications, Total Bookings, Daily Gross Revenue, Active Users, and dynamic 12-month trend charts.
- **US-13.2 (KYC & Verification Approval Drawer):** _As an Admin_, I want a side-by-side inspection tool to:
  - Compare driver license photos against verification selfies.
  - Verify ABN registration and Public Liability Insurance ($10M).
  - Review vocational credentials (e.g., _Certificate III in Beauty Services, TAFE diplomas_).
  - Click **"Approve Verification"** or **"Reject Verification"** (with required reason text).
- **US-13.3 (User Lifecycle Management):** _As an Admin_, I want to search and filter all platform accounts, view booking history, and update account states (_Active, Pending, Paused, Suspended, Blocked_).
- **US-13.4 (Dispute & Refund Governance):** _As an Admin_, I want to inspect disputed bookings, view customer notes vs. artist logs, verify cancellation timelines against the 48-hour policy, and approve or reject refunds.
- **US-13.5 (Dynamic Commission Configuration):** _As an Admin_, I want to configure platform monetization parameters:
  - Standard Platform Commission (default: `15%`).
  - Home Visit Commission Rate (e.g., `18%`).
  - Salon Visit Commission Rate (e.g., `12%`).
  - Minimum and Maximum artist withdrawal thresholds.
- **US-13.6 (Review Moderation & Flagged Queue):** _As an Admin_, I want to inspect community-reported reviews (e.g., `🚩 8 reports - SCAM ARTIST alert`) and execute moderation actions: **Approve Review**, **Hide Review**, **Remove Review**, **Warn User**, or **Suspend Reviewer**.
- **US-13.7 (Omnichannel Marketing Broadcasts):** _As an Admin_, I want to compose Push and HTML Email campaigns, select target audiences (_All Users, Customers Only, Artists Only, Verified Artists Only_), review live mobile/email device mockups, and choose **"Send Now"** or **"Schedule Later"**.
- **US-13.8 (Category & Inspiration CMS):** _As an Admin_, I want to manage platform service categories, home banners, and beauty inspiration gallery collections.
- **US-13.9 (BI Reporting & Analytics):** _As an Admin_, I want platform analytics reporting on User Growth, Booking Status distribution, Commission & Profit trends, Top Artists leaderboard, Customer Retention rate (e.g., `74.2%`), and location demand heatmaps.

---

## 3. Platform Operational Matrix & Business Rules

| Business Domain                   | Rule / Constraint                           | System Action                                                                                                  |
| :-------------------------------- | :------------------------------------------ | :------------------------------------------------------------------------------------------------------------- |
| **Artist Verification**           | Unverified / Pending ABN                    | Artist cannot receive bookings or appear in public search results.                                             |
| **Travel Radius**                 | Customer location $>$ Artist `travelRadius` | System disables Home Visit mode; prompts user to choose Salon or find closer artist.                           |
| **Cancellation ($\ge$ 48 hrs)**   | Customer cancels at least 48 hours prior    | System automatically approves 100% full refund to original payment card.                                       |
| **Cancellation ($<$ 48 hrs)**     | Customer cancels within 48-hour window      | System retains travel fee/penalty and processes partial or zero refund based on policy.                        |
| **Artist Emergency Cancellation** | Artist cancels confirmed booking            | 100% refund processed + $15 AUD credit added to customer wallet + similar artist suggestions.                  |
| **Job Completion Sign-Off**       | Service finished                            | Requires product logging, duration tracking, up to 6 proof photos, and **client on-screen digital signature**. |
| **Commission Split**              | Confirmed payment                           | 15% deducted to platform treasury account; 85% allocated to artist's withdrawable balance.                     |
| **Review Reporting**              | Review receives community flags             | Review queued into Admin Review Moderation panel for administrative sanction.                                  |

---

## 4. Complete Database Collection Mapping

| UI Module / Domain     | Primary DB Collection                                         | Key Embedded Fields / References                                                                            |
| :--------------------- | :------------------------------------------------------------ | :---------------------------------------------------------------------------------------------------------- |
| **Users & Auth**       | `users`, `otps`                                               | Roles (`customer`, `artist`, `admin`), `verificationStatus`, `status`, `passwordHash`.                      |
| **Artist Onboarding**  | `artistprofiles`                                              | `abn`, `drivingLicenseFrontSide`, `drivingLicenseBackSide`, `selfie`, `location` (GeoJSON), `travelRadius`. |
| **Customer Data**      | `customerprofiles`, `useraddresses`                           | `beautyPreferences` tags, `savedArtists` refs, multiple addresses with `2dsphere` coordinates.              |
| **Services & Catalog** | `categories`, `artistservices`                                | `category` ref, `price`, `durationMinutes`, `travelFee`, `isPopular`, `isFeatured`.                         |
| **Availability Rules** | `availabilities`, `artistblockeddates`                        | `weeklySchedule` (daily start/end/breaks), `isQuickBookingEnabled`, `vacationStartDate/EndDate`.            |
| **Booking & Sign-Off** | `bookings`, `bookingcompletions`                              | `bookingId`, `timeline`, `commissionAmount`, `proofPhotos`, `customerSignatureUrl`.                         |
| **Refunds & Disputes** | `refunds`                                                     | `refundId`, `policyApplied` (`48_hour_cancellation_policy`), `walletCompensationCredit`.                    |
| **Feedback & Stories** | `reviews`, `customerstories`                                  | `rating`, `tags` (compliment chips), `reportCount`, `beforeImageUrl`, `afterImageUrl` slider.               |
| **Ledger & Money**     | `paymenttransactions`, `walletledgers`                        | `transactionId`, `platformCommission`, `netPayout`, `balanceAfter`.                                         |
| **Live Chat**          | `conversations`, `chatmessages`                               | `booking` ref, `participants`, `attachments`, `isRead`.                                                     |
| **Admin Operations**   | `platformsettings`, `notificationcampaigns`, `supporttickets` | `platformCommissionPercentage`, `targetAudience`, device preview templates, ticket categories.              |
