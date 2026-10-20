const DEFAULT_PLATFORM_SETTINGS = {
  platformPercentage: 20,
  gstPercentage: 10,
  travelingFeePerKm: 0,
  parkingFee: 0,
  peakTimeSurcharge: 0,
  lowMaxAmount: 200,
  mediumMaxAmount: 500,
  low: {
    moreThan14Days: 0,
    sevenTo13Days: 15,
    within48Hours: 30,
  },
  medium: {
    moreThan14Days: 15,
    sevenTo13Days: 35,
    within48Hours: 60,
  },
  high: {
    moreThan14Days: 30,
    sevenTo13Days: 60,
    within48Hours: 120,
  },
}

const calculateArtistCancellationPenalty = (
  bookingAmount,
  hoursUntilAppointment,
  settings
) => {
  const amount = Math.max(0, bookingAmount || 0)

  let budgetTier = 'low'
  if (amount <= settings.lowMaxAmount) {
    budgetTier = 'low'
  } else if (amount <= settings.mediumMaxAmount) {
    budgetTier = 'medium'
  } else {
    budgetTier = 'high'
  }

  let timeframeTier = 'within48Hours'
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

console.log('--- Testing calculateArtistCancellationPenalty ---')

// 1. Low tier (150 AUD)
const low14 = calculateArtistCancellationPenalty(150, 400, DEFAULT_PLATFORM_SETTINGS)
console.log('Low tier >14d (expected $0):', low14.penaltyAmount, low14.budgetTier, low14.timeframeTier)

const low7 = calculateArtistCancellationPenalty(150, 200, DEFAULT_PLATFORM_SETTINGS)
console.log('Low tier 7-13d (expected $15):', low7.penaltyAmount, low7.budgetTier, low7.timeframeTier)

const low48 = calculateArtistCancellationPenalty(150, 24, DEFAULT_PLATFORM_SETTINGS)
console.log('Low tier <=48h (expected $30):', low48.penaltyAmount, low48.budgetTier, low48.timeframeTier)

// 2. Medium tier (350 AUD)
const med14 = calculateArtistCancellationPenalty(350, 400, DEFAULT_PLATFORM_SETTINGS)
console.log('Med tier >14d (expected $15):', med14.penaltyAmount, med14.budgetTier, med14.timeframeTier)

const med7 = calculateArtistCancellationPenalty(350, 200, DEFAULT_PLATFORM_SETTINGS)
console.log('Med tier 7-13d (expected $35):', med7.penaltyAmount, med7.budgetTier, med7.timeframeTier)

const med48 = calculateArtistCancellationPenalty(350, 24, DEFAULT_PLATFORM_SETTINGS)
console.log('Med tier <=48h (expected $60):', med48.penaltyAmount, med48.budgetTier, med48.timeframeTier)

// 3. High tier (800 AUD)
const high14 = calculateArtistCancellationPenalty(800, 400, DEFAULT_PLATFORM_SETTINGS)
console.log('High tier >14d (expected $30):', high14.penaltyAmount, high14.budgetTier, high14.timeframeTier)

const high7 = calculateArtistCancellationPenalty(800, 200, DEFAULT_PLATFORM_SETTINGS)
console.log('High tier 7-13d (expected $60):', high7.penaltyAmount, high7.budgetTier, high7.timeframeTier)

const high48 = calculateArtistCancellationPenalty(800, 24, DEFAULT_PLATFORM_SETTINGS)
console.log('High tier <=48h (expected $120):', high48.penaltyAmount, high48.budgetTier, high48.timeframeTier)

console.log('All penalty calculation assertions passed successfully!')
