import type { IBookingDoc } from '@repo/db'
import moment from 'moment'
import configs from '@app/configs'

export interface IBookingTaxInvoice {
  invoiceTitle: 'TAX INVOICE'
  invoiceNumber: string
  bookingNumber: string
  issueDate: string
  appointmentDate: string
  currency: 'AUD'

  // Provider / Artist
  seller: {
    artistId: string
    businessName: string
    abn?: string | null
    isGstRegistered: boolean
    email?: string | null
    phone?: string | null
  }

  // Intermediary / Platform
  platform: {
    name: string
    country: 'Australia'
    commissionPercentage: number
    commissionAmount: number
    commissionGst: number
    totalPlatformFee: number
  }

  // Customer
  buyer: {
    customerId: string
    name: string
    email?: string | null
    phone?: string | null
    serviceAddress?: string | null
  }

  // Itemized Line Items
  items: Array<{
    description: string
    quantity: number
    unitPrice: number
    amount: number
  }>

  // Tax Breakdown (ATO Australian GST Rules)
  taxSummary: {
    stripeGstTaxRateId?: string | null
    gstRatePercentage: number
    serviceGstAmount: number
    platformCommissionGst: number
    totalGstAmount: number
    gstIncludedInTotal: boolean
  }

  // Financial Ledger
  financials: {
    grossAmount: number
    discountAmount: number
    platformCreditApplied: number
    totalBookingPrice: number
    initialDepositPaid: number
    balanceDueAmount: number
    artistNetPayout: number
  }

  // Payment Timeline
  payments: {
    depositStatus: string
    depositPaymentIntentId?: string | null
    depositPaidAt?: string | null
    balanceStatus: string
    balancePaymentIntentId?: string | null
    balancePaidAt?: string | null
  }

  // Official Stripe Issued Invoice
  stripeInvoice?: {
    id: string | null
    hostedUrl: string | null
    pdfUrl: string | null
  }
}

/**
 * Generate an official ATO-compliant Tax Invoice object for a Booking
 */
export const generateBookingTaxInvoice = (
  booking: any,
  gstRatePercentage: number = 10
): IBookingTaxInvoice => {
  const artist = booking.artist || {}
  const artistProfile = booking.artistProfile || {}
  const customer = booking.customer || {}
  const service = booking.service || {}

  const guestCount = booking.guestCount || 1
  const unitPrice =
    guestCount > 1
      ? Math.round((booking.servicePrice / guestCount) * 100) / 100
      : booking.servicePrice

  const items: IBookingTaxInvoice['items'] = [
    {
      description: service.name || 'Beauty & Wellness Service',
      quantity: guestCount,
      unitPrice,
      amount: booking.servicePrice,
    },
  ]

  if (booking.travelFee > 0) {
    items.push({
      description: 'Mobile Artist Travel Surcharge',
      quantity: 1,
      unitPrice: booking.travelFee,
      amount: booking.travelFee,
    })
  }

  if (booking.parkingFee > 0) {
    items.push({
      description: 'Artist Parking Fee Reimbursement',
      quantity: 1,
      unitPrice: booking.parkingFee,
      amount: booking.parkingFee,
    })
  }

  return {
    invoiceTitle: 'TAX INVOICE',
    invoiceNumber: `INV-${booking.bookingNumber}`,
    bookingNumber: booking.bookingNumber,
    issueDate: moment(booking.createdAt || new Date()).format('YYYY-MM-DD HH:mm:ss'),
    appointmentDate: `${moment(booking.bookingDate).format('YYYY-MM-DD')} ${booking.startTime}`,
    currency: 'AUD',

    seller: {
      artistId: artist._id?.toString() || booking.artist?.toString(),
      businessName:
        artistProfile.businessName || artist.businessName || artist.name || 'Independent Professional',
      abn: artistProfile.abn || artist.abn || null,
      isGstRegistered: Boolean(artistProfile.isGstRegistered ?? artist.isGstRegistered),
      email: artist.email || null,
      phone: artist.phone || null,
    },

    platform: {
      name: configs.site?.name || 'Stunner alert',
      country: 'Australia',
      commissionPercentage: booking.platformCommissionPercentage || 20,
      commissionAmount: booking.platformCommissionAmount || 0,
      commissionGst: booking.platformCommissionGst || 0,
      totalPlatformFee:
        (booking.platformCommissionAmount || 0) + (booking.platformCommissionGst || 0),
    },

    buyer: {
      customerId: customer._id?.toString() || booking.customer?.toString(),
      name: customer.name || 'Valued Client',
      email: customer.email || null,
      phone: customer.phone || null,
      serviceAddress:
        booking.serviceLocationSnapshot?.address ||
        booking.address?.address ||
        booking.visitType,
    },

    items,

    taxSummary: {
      stripeGstTaxRateId: booking.stripeGstTaxRateId || null,
      gstRatePercentage,
      serviceGstAmount: booking.gstAmount || 0,
      platformCommissionGst: booking.platformCommissionGst || 0,
      totalGstAmount: (booking.gstAmount || 0) + (booking.platformCommissionGst || 0),
      gstIncludedInTotal: true,
    },

    financials: {
      grossAmount: booking.grossAmount,
      discountAmount: booking.discountAmount || 0,
      platformCreditApplied: booking.platformCreditApplied || 0,
      totalBookingPrice: booking.totalBookingPrice,
      initialDepositPaid: booking.initialPayment?.amount || 0,
      balanceDueAmount: booking.balancePayment?.amount || 0,
      artistNetPayout: booking.artistNetPayout || 0,
    },

    payments: {
      depositStatus: booking.initialPayment?.status || 'pending',
      depositPaymentIntentId: booking.initialPayment?.stripePaymentIntentId || null,
      depositPaidAt: booking.initialPayment?.paidAt
        ? moment(booking.initialPayment.paidAt).toISOString()
        : null,
      balanceStatus: booking.balancePayment?.status || 'pending',
      balancePaymentIntentId: booking.balancePayment?.stripePaymentIntentId || null,
      balancePaidAt: booking.balancePayment?.paidAt
        ? moment(booking.balancePayment.paidAt).toISOString()
        : null,
    },

    stripeInvoice: {
      id: booking.stripeInvoiceId || null,
      hostedUrl: booking.stripeInvoiceUrl || null,
      pdfUrl: booking.stripeInvoicePdf || null,
    },
  }
}

export interface IBalancePaymentReceipt {
  receiptTitle: 'PAYMENT RECEIPT'
  receiptNumber: string
  bookingNumber: string
  bookingGroupId: string
  issueDate: string
  currency: 'AUD'
  serviceName: string
  totalBookingPrice: number
  initialDepositPaid: number
  balancePaidAmount: number
  outstandingBalance: 0
  status: 'PAID IN FULL'
  paymentDetails: {
    stripePaymentIntentId?: string | null
    stripeReceiptUrl?: string | null
    paidAt: string
    paymentStage: 'BALANCE_80'
  }
  customer: {
    customerId: string
    name: string
    email?: string | null
    phone?: string | null
  }
  artist: {
    artistId: string
    businessName: string
    name?: string | null
    abn?: string | null
  }
  taxInvoice: {
    stripeInvoiceId?: string | null
    stripeInvoiceUrl?: string | null
    stripeInvoicePdf?: string | null
  }
}

/**
 * Generate an official 80% Balance Payment Receipt for Customer
 */
export const generateBalancePaymentReceipt = (booking: any): IBalancePaymentReceipt => {
  const artist = booking.artist || {}
  const artistProfile = booking.artistProfile || {}
  const customer = booking.customer || {}
  const service = booking.service || {}

  return {
    receiptTitle: 'PAYMENT RECEIPT',
    receiptNumber: `RCT-${booking.bookingNumber}`,
    bookingNumber: booking.bookingNumber,
    bookingGroupId: booking.bookingGroupId || `GRP-${booking.bookingNumber}`,
    issueDate: moment(booking.balancePayment?.paidAt || new Date()).format('YYYY-MM-DD HH:mm:ss'),
    currency: 'AUD',
    serviceName: service.name || 'Beauty & Wellness Service',
    totalBookingPrice: booking.totalBookingPrice,
    initialDepositPaid: booking.initialPayment?.amount || 0,
    balancePaidAmount: booking.balancePayment?.amount || 0,
    outstandingBalance: 0,
    status: 'PAID IN FULL',
    paymentDetails: {
      stripePaymentIntentId: booking.balancePayment?.stripePaymentIntentId || null,
      stripeReceiptUrl: booking.balancePayment?.stripeReceiptUrl || null,
      paidAt: moment(booking.balancePayment?.paidAt || new Date()).toISOString(),
      paymentStage: 'BALANCE_80',
    },
    customer: {
      customerId: customer._id?.toString() || booking.customer?.toString(),
      name: customer.name || 'Valued Client',
      email: customer.email || null,
      phone: customer.phone || null,
    },
    artist: {
      artistId: artist._id?.toString() || booking.artist?.toString(),
      businessName:
        artistProfile.businessName || artist.businessName || artist.name || 'Independent Professional',
      name: artist.name || null,
      abn: artistProfile.abn || artist.abn || null,
    },
    taxInvoice: {
      stripeInvoiceId: booking.stripeInvoiceId || null,
      stripeInvoiceUrl: booking.stripeInvoiceUrl || null,
      stripeInvoicePdf: booking.stripeInvoicePdf || null,
    },
  }
}

export interface IArtistRctiInvoice {
  invoiceTitle: 'RECIPIENT CREATED TAX INVOICE (RCTI)'
  invoiceNumber: string
  bookingNumber: string
  bookingGroupId: string
  issueDate: string
  currency: 'AUD'

  recipientPayer: {
    name: 'Mimilini Pty Ltd'
    abn: '88 701 443 129'
    country: 'Australia'
    email: 'billing@mimilini.com.au'
  }

  supplierPayee: {
    artistId: string
    businessName: string
    name?: string | null
    abn?: string | null
    isGstRegistered: boolean
    email?: string | null
    phone?: string | null
  }

  breakdown: {
    customerGrossCollection: number
    platformCommissionPercentage: number
    platformCommissionFee: number
    platformCommissionGst: number
    totalPlatformDeduction: number
    stripeProcessingFeeBorne: number
    netArtistPayout: number
  }

  statement: string
  stripeInvoice?: {
    id: string | null
    hostedUrl: string | null
    pdfUrl: string | null
  }
}

/**
 * Generate an official Recipient Created Tax Invoice (RCTI) for Artist
 */
export const generateArtistRctiInvoice = (booking: any): IArtistRctiInvoice => {
  const artist = booking.artist || {}
  const artistProfile = booking.artistProfile || {}

  return {
    invoiceTitle: 'RECIPIENT CREATED TAX INVOICE (RCTI)',
    invoiceNumber: `RCTI-${booking.bookingNumber}`,
    bookingNumber: booking.bookingNumber,
    bookingGroupId: booking.bookingGroupId || `GRP-${booking.bookingNumber}`,
    issueDate: moment(booking.balancePayment?.paidAt || booking.updatedAt || new Date()).format(
      'YYYY-MM-DD HH:mm:ss'
    ),
    currency: 'AUD',

    recipientPayer: {
      name: 'Mimilini Pty Ltd',
      abn: '88 701 443 129',
      country: 'Australia',
      email: 'billing@mimilini.com.au',
    },

    supplierPayee: {
      artistId: artist._id?.toString() || booking.artist?.toString(),
      businessName:
        artistProfile.businessName || artist.businessName || artist.name || 'Independent Professional',
      name: artist.name || null,
      abn: artistProfile.abn || artist.abn || null,
      isGstRegistered: Boolean(artistProfile.isGstRegistered ?? artist.isGstRegistered),
      email: artist.email || null,
      phone: artist.phone || null,
    },

    breakdown: {
      customerGrossCollection: booking.grossAmount + (booking.gstAmount || 0),
      platformCommissionPercentage: booking.platformCommissionPercentage || 20,
      platformCommissionFee: booking.platformCommissionAmount || 0,
      platformCommissionGst: booking.platformCommissionGst || 0,
      totalPlatformDeduction:
        (booking.platformCommissionAmount || 0) + (booking.platformCommissionGst || 0),
      stripeProcessingFeeBorne: booking.stripeBalanceFee || 0,
      netArtistPayout: booking.artistNetPayout || 0,
    },

    statement:
      'Issued by Mimilini Pty Ltd under Australian Recipient Created Tax Invoice (RCTI) agreement. The recipient and supplier acknowledge that both are registered for GST where stated and agree that the recipient issues tax invoices in respect of the supplies.',

    stripeInvoice: {
      id: booking.artistStripeInvoiceId || null,
      hostedUrl: booking.artistStripeInvoiceUrl || null,
      pdfUrl: booking.artistStripeInvoicePdf || null,
    },
  }
}

