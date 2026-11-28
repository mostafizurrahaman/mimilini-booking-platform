import moment from 'moment-timezone'
import { DISCOUNT_STATUS, DISCOUNT_TYPES, type IPromoCodeDoc } from '@repo/db'

export interface ICalculateBookingBreakdownParams {
  servicePrice: number
  travelFee?: number
  parkingFee?: number
  isArtistGstRegistered?: boolean
  promoCode?: IPromoCodeDoc | null
  usePlatformCredit?: boolean
  availableWalletCredit?: number
  platformCommissionPercent?: number // default 20
  gstPercent?: number // default 10
}

export interface IBookingFinancialBreakdown {
  servicePrice: number
  travelFee: number
  parkingFee: number
  grossAmount: number
  serviceGst: number
  subtotal: number
  discountAmount: number
  amountAfterDiscount: number
  platformCreditApplied: number
  totalBookingPrice: number // Total final payable by customer

  // 20% / 80% Stage Split:
  initialDepositAmount: number // 20%
  balanceDueAmount: number // 80%

  // Platform & Artist Shared Ledger:
  platformCommissionPercentage: number
  platformCommissionAmount: number
  platformCommissionGst: number
  totalPlatformEarnings: number
  platformNetEarnings: number // Platform net earnings after deducting absorbed initial Stripe fee

  // Stripe Fees:
  stripeInitialFee: number // Absorbed by platform
  stripeBalanceFee: number // Absorbed by artist
  artistNetPayout: number // Final payout transferred to artist
}

export const round2 = (num: number): number => {
  return Math.round((num + Number.EPSILON) * 100) / 100
}

export const calculateBookingBreakdown = (
  params: ICalculateBookingBreakdownParams
): IBookingFinancialBreakdown => {
  const servicePrice = Math.max(0, params.servicePrice || 0)
  const travelFee = Math.max(0, params.travelFee || 0)
  const parkingFee = Math.max(0, params.parkingFee || 0)
  const grossAmount = round2(servicePrice + travelFee + parkingFee)

  const gstPercent = params.gstPercent ?? 10
  const platformCommissionPercent = params.platformCommissionPercent ?? 20

  // 1. Service GST (Only if artist is GST registered with Australian ABN)
  const isArtistGstRegistered = Boolean(params.isArtistGstRegistered)
  const serviceGst = isArtistGstRegistered ? round2(grossAmount * (gstPercent / 100)) : 0

  const subtotal = round2(grossAmount + serviceGst)

  // 2. Promo Code Calculation
  let discountAmount = 0
  const promo = params.promoCode
  if (promo && promo.status === DISCOUNT_STATUS.ACTIVE) {
    const now = new Date()
    const isDateValid = promo.startDate <= now && now <= promo.endDate
    const isMinMet = grossAmount >= (promo.minBookingValue || 0)
    const hasUsageLeft = promo.usageLimit > (promo.usageCount || 0)

    if (isDateValid && isMinMet && hasUsageLeft) {
      if (promo.discountType === DISCOUNT_TYPES.PERCENTAGE) {
        let disc = round2(grossAmount * (promo.discountValue / 100))
        if (promo.maxDiscountAmount && promo.maxDiscountAmount > 0) {
          disc = Math.min(disc, promo.maxDiscountAmount)
        }
        discountAmount = disc
      } else {
        // FIXED discount
        discountAmount = round2(promo.discountValue)
      }
      discountAmount = Math.min(discountAmount, subtotal)
    }
  }

  const amountAfterDiscount = round2(Math.max(0, subtotal - discountAmount))

  // 3. Platform Credit (Wallet) Application
  let platformCreditApplied = 0
  if (params.usePlatformCredit && (params.availableWalletCredit || 0) > 0) {
    platformCreditApplied = round2(Math.min(params.availableWalletCredit || 0, amountAfterDiscount))
  }

  // 4. Final Card Amount Payable
  const totalBookingPrice = round2(Math.max(0, amountAfterDiscount - platformCreditApplied))

  // 5. 20% Initial Deposit & 80% Balance Split
  let initialDepositAmount = 0
  let balanceDueAmount = 0
  if (totalBookingPrice > 0) {
    initialDepositAmount = round2(totalBookingPrice * 0.2)
    balanceDueAmount = round2(totalBookingPrice - initialDepositAmount)
  }

  // 6. Platform Facilitation Commission & GST on Commission
  // Commission is charged strictly on servicePrice (Core Service Value).
  // Travel Fee and Parking Fee are 100% direct cost pass-through reimbursements to the artist.
  const platformCommissionAmount = round2(servicePrice * (platformCommissionPercent / 100))
  const platformCommissionGst = round2(platformCommissionAmount * (gstPercent / 100))
  const totalPlatformEarnings = round2(platformCommissionAmount + platformCommissionGst)

  // 7. Stripe Processing Fees (Australia: 1.65% + $0.30 AUD)
  // Initial 20% Fee -> Absorbed by Platform
  const stripeInitialFee =
    initialDepositAmount > 0 ? round2(initialDepositAmount * 0.0165 + 0.3) : 0

  // Platform Net Earnings after absorbing initial Stripe fee
  const platformNetEarnings = round2(Math.max(0, totalPlatformEarnings - stripeInitialFee))

  // Balance 80% Fee -> Absorbed by Artist
  const stripeBalanceFee = balanceDueAmount > 0 ? round2(balanceDueAmount * 0.0165 + 0.3) : 0

  // 8. Artist Net Payout
  // Artist Gross = subtotal (gross + service GST)
  // Deductions = platform total earnings + stripe balance fee
  const artistNetPayout = round2(Math.max(0, subtotal - totalPlatformEarnings - stripeBalanceFee))

  return {
    servicePrice,
    travelFee,
    parkingFee,
    grossAmount,
    serviceGst,
    subtotal,
    discountAmount,
    amountAfterDiscount,
    platformCreditApplied,
    totalBookingPrice,
    initialDepositAmount,
    balanceDueAmount,
    platformCommissionPercentage: platformCommissionPercent,
    platformCommissionAmount,
    platformCommissionGst,
    totalPlatformEarnings,
    platformNetEarnings,
    stripeInitialFee,
    stripeBalanceFee,
    artistNetPayout,
  }
}

export interface IArtistCancellationPenaltyResult {
  budgetTier: 'low' | 'medium' | 'high'
  timeframeTier: 'moreThan14Days' | 'sevenTo13Days' | 'within48Hours'
  penaltyAmount: number
  hoursUntilAppointment: number
}

export const calculateArtistCancellationPenalty = (
  bookingAmount: number,
  hoursUntilAppointment: number,
  settings: {
    lowMaxAmount: number
    mediumMaxAmount: number
    low: { moreThan14Days: number; sevenTo13Days: number; within48Hours: number }
    medium: { moreThan14Days: number; sevenTo13Days: number; within48Hours: number }
    high: { moreThan14Days: number; sevenTo13Days: number; within48Hours: number }
  }
): IArtistCancellationPenaltyResult => {
  const amount = Math.max(0, bookingAmount || 0)

  // 1. Determine Budget Tier
  let budgetTier: 'low' | 'medium' | 'high' = 'low'
  if (amount <= settings.lowMaxAmount) {
    budgetTier = 'low'
  } else if (amount <= settings.mediumMaxAmount) {
    budgetTier = 'medium'
  } else {
    budgetTier = 'high'
  }

  // 2. Determine Timeframe Tier
  let timeframeTier: 'moreThan14Days' | 'sevenTo13Days' | 'within48Hours' = 'within48Hours'
  if (hoursUntilAppointment >= 14 * 24) {
    timeframeTier = 'moreThan14Days'
  } else if (hoursUntilAppointment > 48) {
    // 13 days down to before 48 hours (covers 48 hours up to 14 days)
    timeframeTier = 'sevenTo13Days'
  } else {
    // Within 48 hours of scheduled commencement time
    timeframeTier = 'within48Hours'
  }

  const penaltyAmount = settings[budgetTier][timeframeTier] || 0

  return {
    budgetTier,
    timeframeTier,
    penaltyAmount,
    hoursUntilAppointment,
  }
}

/**
 * Calculate Great-Circle Distance between two [lng, lat] coordinates in kilometers using Haversine formula
 */
export const calculateDistanceKm = (
  coords1: [number, number],
  coords2: [number, number]
): number => {
  const [lng1, lat1] = coords1
  const [lng2, lat2] = coords2

  console.log({
    coords1,
    coords2,
  })

  const toRad = (deg: number) => (deg * Math.PI) / 180
  const R = 6371 // Earth radius in km

  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2)

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return round2(R * c)
}

/**
 * Resolves the single primary PDF invoice URL that the UI should display to the user
 * based on the viewer's role, the booking status, and payment stages.
 */
export const resolveFinalDisplayedPdfUrl = (
  booking: any,
  role?: string
): {
  finalDisplayedPdfUrl: string | null
  pdfType: 'invoice' | 'rcti' | 'receipt' | 'credit_note' | null
  label: string
} => {
  const isArtist = role === 'artist'
  const isCancelled =
    booking.status === 'cancelled' ||
    booking.status === 'declined' ||
    booking.status === 'no_show'

  // 1. Cancelled / Declined bookings -> Show Credit Note (if exists) or customer invoice
  if (isCancelled) {
    const creditNoteUrl =
      booking.customCreditNotePdf || booking.creditNotePdfUrl || null
    if (creditNoteUrl) {
      return {
        finalDisplayedPdfUrl: creditNoteUrl,
        pdfType: 'credit_note',
        label: 'Adjustment / Credit Note',
      }
    }
    const invUrl = booking.customPdf || booking.stripeInvoicePdf || null
    return {
      finalDisplayedPdfUrl: invUrl,
      pdfType: invUrl ? 'invoice' : null,
      label: invUrl ? 'Cancelled Booking Invoice' : 'No Document',
    }
  }

  // 2. Artist View -> Show RCTI (Artist Custom PDF or Stripe RCTI)
  if (isArtist) {
    const rctiUrl =
      booking.artistCustomPdf || booking.artistStripeInvoicePdf || null
    return {
      finalDisplayedPdfUrl: rctiUrl,
      pdfType: rctiUrl ? 'rcti' : null,
      label: rctiUrl ? 'Recipient Created Tax Invoice (RCTI)' : 'Pending Settlement',
    }
  }

  // 3. Client / Admin View
  // If 80% balance is captured -> Show Payment Receipt if requested or Final Master Invoice
  const isBalancePaid = booking.balancePayment?.status === 'captured'
  const isInitialPaid = booking.initialPayment?.status === 'captured'

  if (isBalancePaid) {
    const finalInvoiceUrl =
      booking.customPdf ||
      booking.stripeInvoicePdf ||
      booking.customReceiptPdf ||
      null
    return {
      finalDisplayedPdfUrl: finalInvoiceUrl,
      pdfType: finalInvoiceUrl ? 'invoice' : null,
      label: finalInvoiceUrl ? 'Tax Invoice (Paid in Full)' : 'Pending Invoice',
    }
  }

  if (isInitialPaid) {
    const depositInvoiceUrl =
      booking.customPdf || booking.stripeInvoicePdf || null
    return {
      finalDisplayedPdfUrl: depositInvoiceUrl,
      pdfType: depositInvoiceUrl ? 'invoice' : null,
      label: depositInvoiceUrl ? 'Tax Invoice (Deposit Paid)' : 'Pending Invoice',
    }
  }

  // Pending / Unpaid booking request
  const unpaidInvoiceUrl =
    booking.customPdf || booking.stripeInvoicePdf || null
  return {
    finalDisplayedPdfUrl: unpaidInvoiceUrl,
    pdfType: unpaidInvoiceUrl ? 'invoice' : null,
    label: unpaidInvoiceUrl ? 'Proforma Invoice (Unpaid)' : 'Payment Pending',
  }
}

/**
 * Calculates pre-cancellation policy notice messages for both Customer and Professional.
 * Directly informs each party in second-person ("you") of exact financial and account consequences
 * according to current booking status, payment status, tier budget, timeframe, and platform policies.
 */
export const resolveCancellationNoticeTexts = (
  booking: any,
  platformSettings?: any
): {
  displayTextForCustomerBeforeCancelling: string
  displayTextForProfessionalBeforeCancelling: string
} => {
  const status = booking.status

  // Terminal / non-cancellable statuses
  if (
    status === 'completed' ||
    status === 'cancelled' ||
    status === 'declined' ||
    status === 'no_show'
  ) {
    return {
      displayTextForCustomerBeforeCancelling: `This booking is already ${status} and cannot be cancelled.`,
      displayTextForProfessionalBeforeCancelling: `This booking is already ${status} and cannot be cancelled.`,
    }
  }

  if (status === 'in_progress') {
    return {
      displayTextForCustomerBeforeCancelling:
        'The appointment is currently in progress. You cannot cancel once service delivery has begun.',
      displayTextForProfessionalBeforeCancelling:
        'The appointment is currently in progress. You cannot cancel once service delivery has begun.',
    }
  }

  const isInitialPaid = booking.initialPayment?.status === 'captured'
  const isBalancePaid =
    booking.balancePayment?.status === 'captured' &&
    (booking.balancePayment?.amount || 0) > 0

  // 1. Pre-payment / Requested status (before customer pays deposit)
  if (!isInitialPaid) {
    return {
      displayTextForCustomerBeforeCancelling:
        'You have not made any payment for this booking yet. If you cancel now, your booking request will be withdrawn immediately without any charges or penalties.',
      displayTextForProfessionalBeforeCancelling:
        'No payment has been charged for this booking yet. If you cancel or decline now, the booking request will be dismissed with no fee or penalty applied to your account.',
    }
  }

  // Calculate hours until appointment
  const appointmentDateStr = moment.utc(booking.bookingDate).format('YYYY-MM-DD')
  const appointmentDateTime = moment(
    `${appointmentDateStr} ${booking.startTime}`,
    'YYYY-MM-DD HH:mm'
  )
  const hoursUntilAppointment = appointmentDateTime.diff(moment(), 'hours', true)

  // 2. Customer side cancellation notice
  let customerNotice = ''
  const depositAmount = booking.initialPayment?.amount || 0
  const totalPaid = round2(depositAmount + (isBalancePaid ? (booking.balancePayment?.amount || 0) : 0))
  const initialStripeFee = booking.stripeInitialFee || 0
  const balanceStripeFee = booking.stripeBalanceFee || 0
  const totalStripeFee = round2(initialStripeFee + (isBalancePaid ? balanceStripeFee : 0))

  if (hoursUntilAppointment >= 24) {
    const refundCredit = round2(Math.max(0, totalPaid - totalStripeFee))
    customerNotice = `You are cancelling more than 24 hours before your appointment. In accordance with our cancellation policy, you will receive $${refundCredit} AUD as Platform Credit (your total paid $${totalPaid} AUD minus $${totalStripeFee} AUD payment processing fee), valid for 36 months.`
  } else {
    // Late cancellation (< 24h)
    if (isBalancePaid) {
      const baseNetPayout = booking.artistNetPayout || 0
      const customerCreditAmount = round2(baseNetPayout * 0.5)
      customerNotice = `You are cancelling within 24 hours of your appointment. Under our late cancellation policy, your initial 20% deposit ($${depositAmount} AUD) is forfeited, and you will receive 50% of the professional service share ($${customerCreditAmount} AUD) as Platform Credit in your wallet.`
    } else {
      customerNotice = `You are cancelling within 24 hours of your appointment. Under our late cancellation policy, your initial 20% deposit payment ($${depositAmount} AUD) is non-refundable and will be forfeited.`
    }
  }

  // 3. Professional side cancellation notice
  let professionalNotice = ''
  if (platformSettings) {
    const bookingAmount = booking.totalBookingPrice || booking.grossAmount || 0
    const penaltyCalc = calculateArtistCancellationPenalty(
      bookingAmount,
      hoursUntilAppointment,
      platformSettings
    )

    let timeframeLabel = 'within 48 hours of the scheduled commencement time'
    if (penaltyCalc.timeframeTier === 'moreThan14Days') {
      timeframeLabel = '14 or more days before the scheduled appointment'
    } else if (penaltyCalc.timeframeTier === 'sevenTo13Days') {
      timeframeLabel = 'between 48 hours and 13 days before the scheduled appointment'
    }

    if (hoursUntilAppointment <= 48) {
      professionalNotice = `You are cancelling within 48 hours of the confirmed appointment (${penaltyCalc.budgetTier.toUpperCase()} ticket booking of $${bookingAmount} AUD). If you cancel now, you will incur a cancellation fee of $${penaltyCalc.penaltyAmount} AUD and your account will be immediately suspended for review under our reliability terms.`
    } else {
      professionalNotice = `You are cancelling ${timeframeLabel} for a confirmed ${penaltyCalc.budgetTier.toUpperCase()} ticket booking of $${bookingAmount} AUD. If you proceed with cancellation, a professional cancellation fee of $${penaltyCalc.penaltyAmount} AUD will be charged to your account, and your profile will be temporarily hidden from customer discovery until resolved.`
    }
  } else {
    // Fallback if settings not provided
    professionalNotice =
      'If you cancel this confirmed booking, professional cancellation fees will apply based on your booking ticket size and notice timeframe, and your account may face temporary restrictions or suspension.'
  }

  return {
    displayTextForCustomerBeforeCancelling: customerNotice,
    displayTextForProfessionalBeforeCancelling: professionalNotice,
  }
}

