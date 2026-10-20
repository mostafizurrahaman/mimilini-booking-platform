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
  if (hoursUntilAppointment > 14 * 24) {
    timeframeTier = 'moreThan14Days'
  } else if (hoursUntilAppointment >= 7 * 24) {
    timeframeTier = 'sevenTo13Days'
  } else {
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
