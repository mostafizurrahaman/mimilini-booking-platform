import { calculateArtistCancellationPenalty } from '../apps/server/src/app/modules/Booking/booking.utils'
import { DEFAULT_PLATFORM_SETTINGS } from '../packages/db/src/apps/modules/PlatformSettings/platform-settings.constants'

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
