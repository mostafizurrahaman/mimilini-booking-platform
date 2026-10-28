import { z } from 'zod'
import moment from 'moment'
import {
  requiredString,
  optionalString,
  enumString,
  optionalEnumString,
  positiveNumber,
  optionalNumber,
  optionalDateOnlyString,
  sortingOrderValues,
} from '@repo/shared'
import { VISIT_TYPE_VALUES } from '@repo/db'

const timeSchema = (fieldName = 'Start Time') =>
  requiredString(fieldName)
    .regex(
      /^((0?[1-9]|1[0-2]):[0-5][0-9]\s*([AaPp][Mm])|([0-1]?[0-9]|2[0-3]):[0-5][0-9])$/,
      `${fieldName} must be in AM/PM format (e.g. 10:00 AM) or HH:mm format`
    )
    .transform((val) => {
      const trimmed = val.trim()
      const m = moment(trimmed, ['h:mm A', 'hh:mm A', 'h:mma', 'hh:mma', 'H:mm', 'HH:mm'], true)
      if (m.isValid()) return m.format('HH:mm')
      const mLoose = moment(trimmed, ['h:mmA', 'hh:mmA', 'h:mm A', 'hh:mm A', 'H:mm', 'HH:mm'])
      return mLoose.isValid() ? mLoose.format('HH:mm') : trimmed
    })

const createBookingSchema = z.object({
  body: z.object({
    artist: requiredString('Artist ID'),
    service: requiredString('Service ID'),
    visitType: enumString(VISIT_TYPE_VALUES, 'Visit Type'),
    address: optionalString('Address ID'),
    bookingDate: requiredString('Booking Date (YYYY-MM-DD)'),
    startTime: timeSchema('Start Time'),
    guestCount: positiveNumber('Guest Count'), // Mandatory
    promoCode: optionalString('Promo Code'),
    usePlatformCredit: z.boolean().default(false),
    paymentMethodId: requiredString('Payment Method ID'),
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
    paymentMethodId: requiredString('Payment Method ID'),
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
    newStartTime: timeSchema('New Start Time'),
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
    tab: enumString(
      ['all', 'upcoming', 'pending', 'new_requests', 'completed', 'cancelled'],
      'Tab'
    ),
    page: optionalNumber('Page'),
    limit: optionalNumber('Limit'),
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

const customerSignSchema = z.object({
  body: z.object({
    customerSignature: requiredString('Customer Signature'),
  }),
})

const getAllBookingsAdminQuerySchema = z.object({
  query: z.object({
    page: optionalNumber('Page'),
    limit: optionalNumber('Limit'),
    search: optionalString('Search'),
    status: optionalString('Status'),
    category: optionalString('Category'),
    visitType: optionalEnumString(VISIT_TYPE_VALUES, 'Visit Type'),
    paymentStatus: optionalString('Payment Status'),
    startDate: optionalDateOnlyString('Start Date'),
    endDate: optionalDateOnlyString('End Date'),
    sortBy: optionalString('Sort By'),
    sortOrder: optionalEnumString(sortingOrderValues, 'Sort Order'),
  }),
})

const getRecentBookingsAdminQuerySchema = z.object({
  query: z.object({
    limit: optionalNumber('Limit'),
  }),
})

const updateAdminBookingNotesSchema = z.object({
  body: z.object({
    adminNotes: requiredString('Admin Notes'),
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
  customerSignSchema,
  rescheduleRequestSchema,
  rescheduleResponseSchema,
  getMyBookingsQuerySchema,
  reportCustomerNoShowSchema,
  verifyCustomerNoShowSchema,
  getAllBookingsAdminQuerySchema,
  getRecentBookingsAdminQuerySchema,
  updateAdminBookingNotesSchema,
}
