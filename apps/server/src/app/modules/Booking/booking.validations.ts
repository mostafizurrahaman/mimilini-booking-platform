import { z } from 'zod'
import {
  requiredString,
  optionalString,
  enumString,
  optionalEnumString,
  positiveNumber,
} from '@repo/shared'
import { VISIT_TYPE_VALUES } from '@repo/db'

const createBookingSchema = z.object({
  body: z.object({
    artist: requiredString('Artist ID'),
    service: requiredString('Service ID'),
    visitType: enumString(VISIT_TYPE_VALUES, 'Visit Type'),
    address: optionalString('Address ID'),
    bookingDate: requiredString('Booking Date (YYYY-MM-DD)'),
    startTime: requiredString('Start Time').regex(
      /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/,
      'Start time must be in HH:mm format'
    ),
    guestCount: positiveNumber('Guest Count'), // Mandatory
    promoCode: optionalString('Promo Code'),
    usePlatformCredit: z.boolean().default(false),
    paymentMethodId: optionalString('Payment Method ID'),
  }),
})

const checkoutPreviewSchema = z.object({
  body: z.object({
    artist: requiredString('Artist ID'),
    service: requiredString('Service ID'),
    guestCount: positiveNumber('Guest Count'), // Mandatory
    visitType: optionalEnumString(VISIT_TYPE_VALUES, 'Visit Type'),
    address: optionalString('Address ID'),
    promoCode: optionalString('Promo Code'),
    usePlatformCredit: z.boolean().default(false),
  }),
})

const confirmBookingPaymentSchema = z.object({
  body: z.object({
    paymentMethodId: optionalString('Payment Method ID'),
    usePlatformCredit: z.boolean().optional(),
  }),
})

const cancelBookingSchema = z.object({
  body: z.object({
    reason: optionalString('Cancellation Reason'),
  }),
})

const payBalanceSchema = z.object({
  body: z.object({
    paymentMethodId: optionalString('Payment Method ID'),
  }),
})

const declineBookingSchema = z.object({
  body: z.object({
    reason: optionalString('Decline reason'),
  }),
})

const completeBookingSchema = z.object({
  body: z
    .object({
      servicesPerformed: optionalString('Services Performed'),
      productsUsed: optionalString('Products Used'),
      totalWorkingTime: optionalString('Total Working Time'),
      specialNotes: optionalString('Special Notes'),
      customerSignature: optionalString('Customer Signature'),
      data: z.string().optional(),
    })
    .passthrough(),
})

const rescheduleRequestSchema = z.object({
  body: z.object({
    newDate: requiredString('New Date (YYYY-MM-DD)'),
    newStartTime: requiredString('New Start Time (HH:mm)').regex(
      /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/,
      'Start time must be in HH:mm format'
    ),
    reason: requiredString('Reason for rescheduling'),
    message: optionalString('Message'),
  }),
})

const rescheduleResponseSchema = z.object({
  body: z.object({
    action: z.enum(['accept', 'decline']),
    declineReason: optionalString('Decline Reason'),
  }),
})

const getMyBookingsQuerySchema = z.object({
  query: z.object({
    tab: z
      .enum(['all', 'upcoming', 'pending', 'new_requests', 'completed', 'cancelled'])
      .optional(),
    page: z.string().optional(),
    limit: z.string().optional(),
  }),
})

const reportCustomerNoShowSchema = z.object({
  body: z.object({
    reason: optionalString('No-Show Reason'),
    isSafetyConcern: z.boolean().optional(),
  }),
})

const verifyCustomerNoShowSchema = z.object({
  body: z.object({
    isApproved: z.boolean(),
    adminNotes: optionalString('Admin Notes'),
  }),
})

export const bookingValidations = {
  createBookingSchema,
  checkoutPreviewSchema,
  confirmBookingPaymentSchema,
  cancelBookingSchema,
  payBalanceSchema,
  declineBookingSchema,
  completeBookingSchema,
  rescheduleRequestSchema,
  rescheduleResponseSchema,
  getMyBookingsQuerySchema,
  reportCustomerNoShowSchema,
  verifyCustomerNoShowSchema,
}
