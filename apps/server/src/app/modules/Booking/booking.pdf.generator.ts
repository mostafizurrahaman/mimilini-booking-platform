import PDFDocument from 'pdfkit'
import { uploadBufferToS3 } from 'packages/media-hub/src'
import { Booking, ArtistProfile } from '@repo/db'
import { logger } from '@app/libs/logger'
import moment from 'moment'

export interface IInvoicePdfData {
  title: string
  invoiceNumber: string
  issueDate: string
  dueDate?: string | null
  statusText: string
  bookingNumber: string
  appointmentDate: string
  serviceType: string
  seller: {
    name: string
    businessName: string
    abn?: string | null
    isGstRegistered: boolean
    email?: string | null
  }
  buyer: {
    name: string
    email?: string | null
    address?: string | null
  }
  items: Array<{
    description: string
    quantity: number
    unitPrice: number
    amount: number
    gstRate?: string
  }>
  totals: {
    subtotal: number
    discount?: number
    gstAmount: number
    totalAmount: number
  }
  paymentBreakdown?: Array<{
    label: string
    amount: number
    note?: string
  }>
  dueSchedule?: {
    currentPaid: number
    initialDeposit: number
    balanceDue: number
    totalOutstanding: number
  }
  balanceDue?: number
  footerNote?: string
}

export interface IRctiPdfData {
  invoiceNumber: string
  issueDate: string
  bookingNumber: string
  payoutMethod?: string
  transferGroup?: string
  recipient: {
    name: string
    abn: string
    email: string
    address?: string | null
  }
  supplier: {
    name: string
    businessName: string
    abn?: string | null
    isGstRegistered: boolean
    address?: string | null
  }
  collections: Array<{
    description: string
    gstRate?: string
    amount: number
  }>
  totalGrossCollection: number
  totalServiceGst: number
  deductions: Array<{
    description: string
    basis?: string
    amount: number
    isAbsorbed?: boolean
    note?: string
  }>
  totalDeductions: number
  netPayout: number
  settlementSummary?: {
    coreServiceNet: number
    travelFeeReimbursement: number
    parkingFeeReimbursement: number
    serviceGstAmount?: number
    balanceProcessingFee: number
  }
  payoutStatus: string
  transferId?: string | null
}

export interface IReceiptPdfData {
  receiptNumber: string
  bookingNumber: string
  receiptDate: string
  customerName: string
  customerEmail?: string | null
  artistName: string
  artistAbn?: string | null
  serviceName: string
  totalBookingPrice: number
  priorDepositPaid: number
  amountChargedToday: number
  remainingBalance: number
  paymentMethodText: string
  transactionRef: string
}

export interface ICreditNotePdfData {
  creditNoteNumber: string
  originalInvoiceNumber: string
  bookingNumber: string
  date: string
  customerName: string
  customerEmail?: string | null
  reason: string
  reversedItems: Array<{
    description: string
    amount: number
    gstRate?: string
  }>
  totalAdjustment: number
  walletRefundAmount: number
  cardRefundAmount: number
  voidedAmount: number
}

export const fmt = (num: number | undefined | null): string => {
  if (typeof num !== 'number' || isNaN(num)) return '0.00'
  return num.toFixed(2)
}

const buildPdfBuffer = (docBuilder: (doc: InstanceType<typeof PDFDocument>) => void): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4' })
    const buffers: Buffer[] = []

    doc.on('data', (chunk) => buffers.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(buffers)))
    doc.on('error', (err) => reject(err))

    docBuilder(doc)
    doc.end()
  })
}

const uploadPdfBufferToS3 = async (buffer: Buffer, folder: string, fileName: string): Promise<string> => {
  const uploaded = await uploadBufferToS3(buffer, folder, fileName, 'application/pdf')
  return uploaded.url
}

/**
 * 1. Customer Tax Invoice / Invoice PDF Builder
 */
export const generateAndUploadCustomerInvoicePdf = async (
  data: IInvoicePdfData
): Promise<string> => {
  const buffer = await buildPdfBuffer((doc) => {
    // Header
    doc.fontSize(20).font('Helvetica-Bold').fillColor('#0F172A').text('STUNNER ALERT', 40, 40)
    doc
      .fontSize(7.5)
      .font('Helvetica')
      .fillColor('#64748B')
      .text('Stunner Alert Pty Ltd (Platform) | ABN: 88 701 443 129', 40, 64)
    doc.text('support@stunneralert.com.au', 40, 75)

    doc.fontSize(14).font('Helvetica-Bold').fillColor('#0F172A').text(data.title, 315, 40, { width: 240, align: 'right' })
    doc.fontSize(7.5).font('Helvetica').fillColor('#334155')
    doc.text(`Invoice No: ${data.invoiceNumber}`, 315, 60, { width: 240, align: 'right' })
    doc.text(`Issue Date: ${data.issueDate}`, 315, 71, { width: 240, align: 'right' })
    if (data.dueDate) {
      doc.text(`Due Date: ${data.dueDate}`, 315, 82, { width: 240, align: 'right' })
    }

    doc.strokeColor('#E2E8F0').lineWidth(0.75).moveTo(40, 98).lineTo(555, 98).stroke()

    // Parties
    doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#64748B').text('SERVICE PROVIDER (PROFESSIONAL):', 40, 108)
    doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#0F172A').text(data.seller.businessName || data.seller.name, 40, 120)
    doc.fontSize(7.5).font('Helvetica').fillColor('#334155')
    let py = 132
    if (data.seller.abn) {
      doc.text(`ABN: ${data.seller.abn}`, 40, py)
      py += 11
    }
    doc.text(`GST Registered: ${data.seller.isGstRegistered ? 'YES' : 'NO'}`, 40, py)

    doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#64748B').text('CLIENT / BILLED TO:', 315, 108)
    doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#0F172A').text(data.buyer.name, 315, 120)
    doc.fontSize(7.5).font('Helvetica').fillColor('#334155')
    let cy = 132
    if (data.buyer.email) {
      doc.text(data.buyer.email, 315, cy)
      cy += 11
    }
    if (data.buyer.address) {
      doc.text(data.buyer.address, 315, cy, { width: 240 })
    }

    // Status Banner
    doc.rect(40, 164, 515, 20).fillAndStroke('#F8FAFC', '#E2E8F0')
    doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#1E293B')
    doc.text(
      `STATUS: [ ${data.statusText} ]  •  BOOKING REF: #${data.bookingNumber}  •  APPOINTMENT: ${data.appointmentDate}`,
      48,
      170
    )

    // Table Header
    let y = 194
    doc.rect(40, y, 515, 18).fill('#1E293B')
    doc.fontSize(7).font('Helvetica-Bold').fillColor('#FFFFFF')
    doc.text('#', 48, y + 5, { width: 20 })
    doc.text('ITEM DESCRIPTION', 72, y + 5, { width: 235 })
    doc.text('QTY', 310, y + 5, { width: 30, align: 'center' })
    doc.text('UNIT PRICE (AUD)', 345, y + 5, { width: 70, align: 'right' })
    doc.text('GST RATE', 420, y + 5, { width: 50, align: 'center' })
    doc.text('TOTAL AUD', 475, y + 5, { width: 72, align: 'right' })

    // Table Rows
    y += 18
    doc.font('Helvetica').fontSize(7.5).fillColor('#1E293B')
    let idx = 1
    for (const item of data.items) {
      const idxStr = idx.toString().padStart(2, '0')
      const gstRateText = item.gstRate || (data.seller.isGstRegistered ? '10.0%' : '0.0%')
      doc.text(idxStr, 48, y + 5, { width: 20 })
      doc.text(item.description, 72, y + 5, { width: 235 })
      doc.text(item.quantity.toString(), 310, y + 5, { width: 30, align: 'center' })
      doc.text(`$${fmt(item.unitPrice)}`, 345, y + 5, { width: 70, align: 'right' })
      doc.text(gstRateText, 420, y + 5, { width: 50, align: 'center' })
      doc.text(`$${fmt(item.amount)}`, 475, y + 5, { width: 72, align: 'right' })
      y += 18
      doc.strokeColor('#F1F5F9').lineWidth(0.5).moveTo(40, y).lineTo(555, y).stroke()
      idx++
    }

    // Totals Block
    y += 8
    doc.fontSize(7.5).font('Helvetica').fillColor('#475569')
    doc.text('Gross Service Total:', 330, y, { width: 130, align: 'right' })
    doc.text(`$${fmt(data.totals?.subtotal)}`, 465, y, { width: 82, align: 'right' })

    if (data.totals?.discount && data.totals.discount > 0) {
      y += 13
      doc.text('Promo Code Discount:', 330, y, { width: 130, align: 'right' })
      doc.text(`-$${fmt(data.totals.discount)}`, 465, y, { width: 82, align: 'right' })
    }

    y += 13
    const gstLabel = data.seller.isGstRegistered ? 'Total GST (10% Inc):' : 'GST (0% Not Registered):'
    doc.text(gstLabel, 330, y, { width: 130, align: 'right' })
    doc.text(`$${fmt(data.totals?.gstAmount)}`, 465, y, { width: 82, align: 'right' })

    y += 15
    doc.rect(320, y - 3, 235, 20).fill('#EFF6FF').stroke('#BFDBFE')
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#1D4ED8')
    doc.text('Total Booking Price:', 330, y + 2)
    doc.fontSize(8.5)
    doc.text(`$${fmt(data.totals?.totalAmount)} AUD`, 440, y + 2, { width: 107, align: 'right' })

    // Payment Ledger / Due Schedule
    if (data.paymentBreakdown && data.paymentBreakdown.length > 0) {
      y += 28
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#334155').text('PAYMENT METHOD & TENDER BREAKDOWN:', 40, y)
      y += 12
      doc.font('Helvetica').fontSize(7.5).fillColor('#475569')
      for (const p of data.paymentBreakdown) {
        doc.text(`• ${p.label}`, 50, y)
        doc.text(`-$${fmt(p.amount)}`, 465, y, { width: 82, align: 'right' })
        y += 12
      }
    } else if (data.dueSchedule) {
      y += 28
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#334155').text('PAYMENT STATUS & DUE SCHEDULE:', 40, y)
      y += 12
      doc.font('Helvetica').fontSize(7.5).fillColor('#475569')
      doc.text('• Current Amount Paid:', 50, y)
      doc.text(`$${fmt(data.dueSchedule.currentPaid)}`, 465, y, { width: 82, align: 'right' })
      y += 12
      doc.text('• Initial 20% Deposit (Due upon professional confirmation):', 50, y)
      doc.text(`$${fmt(data.dueSchedule.initialDeposit)}`, 465, y, { width: 82, align: 'right' })
      y += 12
      doc.text('• Remaining 80% Balance (Due 24h before appointment):', 50, y)
      doc.text(`$${fmt(data.dueSchedule.balanceDue)}`, 465, y, { width: 82, align: 'right' })
      y += 12
    }

    if (data.balanceDue !== undefined) {
      y += 6
      const isSettled = data.balanceDue === 0
      doc.rect(40, y - 3, 515, 18).fill(isSettled ? '#F0FDF4' : '#FEF2F2').stroke(isSettled ? '#BBF7D0' : '#FECACA')
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor(isSettled ? '#15803D' : '#B91C1C')
      doc.text('BALANCE DUE / OUTSTANDING:', 48, y + 2)
      doc.text(
        isSettled ? '$0.00 AUD [ PAID IN FULL ]' : `$${fmt(data.balanceDue)} AUD`,
        380,
        y + 2,
        { width: 167, align: 'right' }
      )
    }

    // Footer note
    doc.strokeColor('#E2E8F0').lineWidth(0.5).moveTo(40, 770).lineTo(555, 770).stroke()
    doc.fontSize(7).font('Helvetica').fillColor('#94A3B8')
    doc.text(
      data.footerNote ||
        'Total price includes Australian GST where applicable. All transactions are in Australian Dollars (AUD). Issued by Stunner Alert Pty Ltd.',
      40,
      778,
      { width: 515, align: 'center' }
    )
  })

  return uploadPdfBufferToS3(buffer, 'invoices', `customer-invoice-${data.bookingNumber}.pdf`)
}

/**
 * 2. Artist Recipient Created Tax Invoice (RCTI) PDF Builder
 */
export const generateAndUploadArtistRctiPdf = async (
  data: IRctiPdfData
): Promise<string> => {
  const buffer = await buildPdfBuffer((doc) => {
    // Header
    doc.fontSize(20).font('Helvetica-Bold').fillColor('#0F172A').text('STUNNER ALERT', 40, 40)
    doc
      .fontSize(7.5)
      .font('Helvetica')
      .fillColor('#64748B')
      .text('Mimilini Pty Ltd t/a Stunner Alert (Recipient / Payer)', 40, 64)
    doc.text(`ABN: ${data.recipient.abn} | ${data.recipient.email || 'support@stunneralert.com.au'}`, 40, 75)

    doc
      .fontSize(13)
      .font('Helvetica-Bold')
      .fillColor('#0F172A')
      .text('RECIPIENT CREATED TAX INVOICE (RCTI)', 250, 40, { width: 305, align: 'right' })
    doc.fontSize(7.5).font('Helvetica').fillColor('#334155')
    doc.text(`Invoice Number: ${data.invoiceNumber}`, 315, 60, { width: 240, align: 'right' })
    doc.text(`Issue Date:     ${data.issueDate}`, 315, 71, { width: 240, align: 'right' })
    doc.text(`Booking Ref:    #${data.bookingNumber}`, 315, 82, { width: 240, align: 'right' })
    doc.text(`Payout Method:  ${data.payoutMethod || 'Stripe Connect'}`, 315, 93, { width: 240, align: 'right' })

    doc.strokeColor('#E2E8F0').lineWidth(0.75).moveTo(40, 106).lineTo(555, 106).stroke()

    // Professional / Supplier Section
    doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#64748B').text('SUPPLIER / SERVICE PROFESSIONAL:', 40, 114)
    doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#0F172A').text(data.supplier.businessName || data.supplier.name, 40, 126)
    doc.fontSize(7.5).font('Helvetica').fillColor('#334155')
    let sy = 138
    doc.text(`ABN: ${data.supplier.abn || 'Not Registered'}`, 40, sy)
    doc.text(`GST Registered: ${data.supplier.isGstRegistered ? 'YES' : 'NO'}`, 220, sy)
    if (data.supplier.address) {
      sy += 11
      doc.text(`Address: ${data.supplier.address}`, 40, sy, { width: 500 })
    }

    // SECTION 1: GROSS CLIENT COLLECTION
    let y = sy + 15
    doc.rect(40, y, 515, 16).fill('#1E293B')
    doc.fontSize(7).font('Helvetica-Bold').fillColor('#FFFFFF')
    doc.text('SECTION 1: GROSS CLIENT COLLECTION (TOTAL EARNINGS COLLECTED ON YOUR BEHALF)', 48, y + 4)
    doc.text('GST Rate', 355, y + 4, { width: 60, align: 'center' })
    doc.text('Gross Amount (AUD)', 430, y + 4, { width: 115, align: 'right' })

    y += 16
    doc.font('Helvetica').fontSize(7.5).fillColor('#1E293B')
    let cIdx = 1
    for (const c of data.collections) {
      const gstRate = c.gstRate || (data.supplier.isGstRegistered ? '10.0%' : '0.0%')
      doc.text(`${cIdx}. ${c.description}`, 48, y + 4, { width: 300 })
      doc.text(gstRate, 355, y + 4, { width: 60, align: 'center' })
      doc.text(`$${fmt(c.amount)}`, 440, y + 4, { width: 105, align: 'right' })
      y += 16
      doc.strokeColor('#F1F5F9').lineWidth(0.5).moveTo(40, y).lineTo(555, y).stroke()
      cIdx++
    }

    y += 4
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#0F172A')
    doc.text('TOTAL GROSS CLIENT COLLECTION:', 200, y, { width: 230, align: 'right' })
    doc.text(`$${fmt(data.totalGrossCollection)} AUD`, 440, y, { width: 105, align: 'right' })

    y += 12
    doc.font('Helvetica').fontSize(7).fillColor('#64748B')
    const gstCollectedText =
      data.supplier.isGstRegistered && (data.totalServiceGst || 0) > 0
        ? `(Includes GST of $${fmt(data.totalServiceGst)} AUD on Gross Supplies)`
        : '(GST: $0.00 AUD - Supplier Not Registered for GST)'
    doc.text(gstCollectedText, 48, y, { width: 500, align: 'right' })

    // SECTION 2: DEDUCTIONS & PLATFORM FACILITATION FEES
    y += 16
    doc.rect(40, y, 515, 16).fill('#334155')
    doc.fontSize(7).font('Helvetica-Bold').fillColor('#FFFFFF')
    doc.text('SECTION 2: DEDUCTIONS & PLATFORM FACILITATION FEES', 48, y + 4)
    doc.text('Rate / Basis', 305, y + 4, { width: 130, align: 'center' })
    doc.text('Deduction (AUD)', 445, y + 4, { width: 100, align: 'right' })

    y += 16
    doc.font('Helvetica').fontSize(7.5).fillColor('#1E293B')
    for (const d of data.deductions) {
      if (d.isAbsorbed) {
        doc.text(`• ${d.description}`, 48, y + 4, { width: 250 })
        doc.font('Helvetica-Bold').fontSize(7).fillColor('#15803D')
        doc.text('[ FULLY ABSORBED BY STUNNER ALERT ]', 290, y + 4, { width: 160, align: 'center' })
        doc.font('Helvetica').fontSize(7.5).fillColor('#1E293B')
        doc.text('$0.00', 445, y + 4, { width: 100, align: 'right' })
      } else {
        doc.text(`• ${d.description}`, 48, y + 4, { width: 250 })
        if (d.basis) {
          doc.text(d.basis, 305, y + 4, { width: 130, align: 'center' })
        }
        doc.text(`-$${fmt(d.amount)}`, 445, y + 4, { width: 100, align: 'right' })
      }
      y += 16
      doc.strokeColor('#F1F5F9').lineWidth(0.5).moveTo(40, y).lineTo(555, y).stroke()
    }

    y += 4
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#0F172A')
    doc.text('TOTAL DEDUCTIONS:', 250, y, { width: 180, align: 'right' })
    doc.text(`-$${fmt(data.totalDeductions)} AUD`, 445, y, { width: 100, align: 'right' })

    // SECTION 3: NET PROFESSIONAL SETTLEMENT & PAYOUT SUMMARY
    y += 18
    doc.rect(40, y, 515, 16).fill('#1E293B')
    doc.fontSize(7).font('Helvetica-Bold').fillColor('#FFFFFF')
    doc.text('SECTION 3: NET PROFESSIONAL SETTLEMENT & PAYOUT SUMMARY', 48, y + 4)

    y += 18
    doc.rect(40, y, 515, 68).fill('#F0FDF4').stroke('#BBF7D0')
    let boxY = y + 7
    doc.font('Helvetica').fontSize(7.5).fillColor('#1E293B')
    if (data.settlementSummary) {
      doc.text(`• Core Service Net Earnings: $${fmt(data.settlementSummary.coreServiceNet)}`, 50, boxY)
      if (data.settlementSummary.travelFeeReimbursement && data.settlementSummary.travelFeeReimbursement > 0) {
        doc.text(`• Direct Travel Fee Reimbursement (Zero Commission): $${fmt(data.settlementSummary.travelFeeReimbursement)}`, 280, boxY)
      }
      boxY += 11
      if (data.settlementSummary.parkingFeeReimbursement && data.settlementSummary.parkingFeeReimbursement > 0) {
        doc.text(`• Direct Parking Fee Reimbursement (Zero Commission): $${fmt(data.settlementSummary.parkingFeeReimbursement)}`, 50, boxY)
      }
      if (data.settlementSummary.serviceGstAmount && data.settlementSummary.serviceGstAmount > 0) {
        doc.text(`• Service GST Collected On Your Behalf: $${fmt(data.settlementSummary.serviceGstAmount)}`, 280, boxY)
      }
      boxY += 11
      doc.text(`• Less: Platform Processing Fee on Balance Payment: -$${fmt(data.settlementSummary.balanceProcessingFee)}`, 50, boxY)
      boxY += 12
    }

    doc.font('Helvetica-Bold').fontSize(9).fillColor('#065F46')
    doc.text('TOTAL NET PAYOUT TRANSFERRED TO YOUR BANK ACCOUNT:', 50, boxY)
    doc.text(`$${fmt(data.netPayout)} AUD`, 420, boxY, { width: 125, align: 'right' })
    boxY += 12

    doc.font('Helvetica').fontSize(7).fillColor('#64748B')
    const transferGroupText = data.transferGroup || `GRP-${data.bookingNumber}`
    const transferIdText = data.transferId ? ` | Transfer ID: ${data.transferId}` : ''
    doc.text(
      `Transfer Status: [ ${data.payoutStatus || 'COMPLETED / TRANSFERRED VIA STRIPE CONNECT'} ] | Stripe Transfer Group: ${transferGroupText}${transferIdText}`,
      50,
      boxY
    )

    // ATO Compliance Declaration
    y += 76
    doc.fontSize(6.5).font('Helvetica').fillColor('#64748B')
    doc.text(
      'ATO COMPLIANCE & RCTI AGREEMENT DECLARATION:\n• Issued by Mimilini Pty Ltd t/a Stunner Alert under Australian Recipient Created Tax Invoice (RCTI) guidelines.\n• The supplier and the recipient acknowledge that both are registered for GST where indicated.\n• The supplier agrees that the recipient (Stunner Alert) will issue tax invoices in respect of the supplies, and the supplier will not issue tax invoices in respect of these supplies.',
      40,
      y,
      { width: 515, lineGap: 1.5 }
    )

    // Footer note
    doc.strokeColor('#E2E8F0').lineWidth(0.5).moveTo(40, 770).lineTo(555, 770).stroke()
    doc.fontSize(7).font('Helvetica').fillColor('#94A3B8')
    doc.text(
      'Recipient Created Tax Invoice issued pursuant to Subsection 153-B of the A New Tax System (Goods and Services Tax) Act 1999.',
      40,
      778,
      { width: 515, align: 'center' }
    )
  })

  return uploadPdfBufferToS3(buffer, 'invoices', `artist-rcti-${data.bookingNumber}.pdf`)
}

/**
 * 3. 80% Balance Payment Receipt PDF Builder
 */
export const generateAndUploadBalanceReceiptPdf = async (
  data: IReceiptPdfData
): Promise<string> => {
  const buffer = await buildPdfBuffer((doc) => {
    // Header
    doc.fontSize(20).font('Helvetica-Bold').fillColor('#0F172A').text('STUNNER ALERT', 40, 40)
    doc.fontSize(7.5).font('Helvetica').fillColor('#64748B').text('Stunner Alert Pty Ltd | ABN: 88 701 443 129', 40, 64)
    doc.text('support@stunneralert.com.au', 40, 75)

    doc.fontSize(15).font('Helvetica-Bold').fillColor('#0F172A').text('PAYMENT RECEIPT', 315, 40, { width: 240, align: 'right' })
    doc.fontSize(7.5).font('Helvetica').fillColor('#334155')
    doc.text(`Receipt No: ${data.receiptNumber}`, 315, 60, { width: 240, align: 'right' })
    doc.text(`Receipt Date: ${data.receiptDate}`, 315, 71, { width: 240, align: 'right' })
    doc.text(`Booking Ref: #${data.bookingNumber}`, 315, 82, { width: 240, align: 'right' })

    doc.strokeColor('#E2E8F0').lineWidth(0.75).moveTo(40, 100).lineTo(555, 100).stroke()

    doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#64748B').text('PAYMENT BY:', 40, 110)
    doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#0F172A').text(data.customerName, 40, 122)
    if (data.customerEmail) doc.fontSize(7.5).font('Helvetica').fillColor('#334155').text(data.customerEmail, 40, 134)

    doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#64748B').text('PROFESSIONAL PROVIDER:', 315, 110)
    doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#0F172A').text(data.artistName, 315, 122)
    if (data.artistAbn) doc.fontSize(7.5).font('Helvetica').fillColor('#334155').text(`ABN: ${data.artistAbn}`, 315, 134)

    // Transaction Details
    let y = 160
    doc.rect(40, y, 515, 18).fill('#1E293B')
    doc.fontSize(7).font('Helvetica-Bold').fillColor('#FFFFFF')
    doc.text('FINAL 80% BALANCE SETTLEMENT DETAILS', 48, y + 5)

    y += 24
    doc.font('Helvetica').fontSize(7.5).fillColor('#334155')
    doc.text(`• Service: ${data.serviceName}`, 48, y)
    y += 14
    doc.text(`• Payment Tender: ${data.paymentMethodText}`, 48, y)
    y += 14
    doc.text(`• Gateway Transaction ID: ${data.transactionRef}`, 48, y)

    y += 24
    doc.rect(40, y, 515, 80).fill('#F8FAFC').stroke('#E2E8F0')
    doc.font('Helvetica').fontSize(7.5).fillColor('#334155')
    doc.text('Total Booking Value:', 55, y + 10)
    doc.text(`$${fmt(data.totalBookingPrice)} AUD`, 460, y + 10, { width: 85, align: 'right' })

    doc.text('Less: Prior Deposit Paid (20%):', 55, y + 26)
    doc.text(`-$${fmt(data.priorDepositPaid)} AUD`, 460, y + 26, { width: 85, align: 'right' })

    doc.font('Helvetica-Bold').fillColor('#065F46')
    doc.text('Amount Charged Today (80% Balance):', 55, y + 42)
    doc.text(`$${fmt(data.amountChargedToday)} AUD`, 460, y + 42, { width: 85, align: 'right' })

    doc.font('Helvetica-Bold').fillColor('#15803D')
    doc.text('Outstanding Remaining Balance:', 55, y + 58)
    doc.text(`$${fmt(data.remainingBalance)} AUD [ PAID IN FULL ]`, 380, y + 58, { width: 165, align: 'right' })

    // Footer note
    doc.strokeColor('#E2E8F0').lineWidth(0.5).moveTo(40, 770).lineTo(555, 770).stroke()
    doc.fontSize(7).font('Helvetica').fillColor('#94A3B8')
    doc.text(
      'Thank you for your payment. Your appointment is now confirmed and settled. Stunner Alert Pty Ltd.',
      40,
      778,
      { width: 515, align: 'center' }
    )
  })

  return uploadPdfBufferToS3(buffer, 'invoices', `balance-receipt-${data.bookingNumber}.pdf`)
}

/**
 * 4. Credit Note / Adjustment Note PDF Builder
 */
export const generateAndUploadCreditNotePdf = async (
  data: ICreditNotePdfData
): Promise<string> => {
  const buffer = await buildPdfBuffer((doc) => {
    // Header
    doc.fontSize(20).font('Helvetica-Bold').fillColor('#0F172A').text('STUNNER ALERT', 40, 40)
    doc.fontSize(7.5).font('Helvetica').fillColor('#64748B').text('Stunner Alert Pty Ltd | ABN: 88 701 443 129', 40, 64)
    doc.text('support@stunneralert.com.au', 40, 75)

    doc.fontSize(14).font('Helvetica-Bold').fillColor('#B91C1C').text('ADJUSTMENT / CREDIT NOTE', 250, 40, { width: 305, align: 'right' })
    doc.fontSize(7.5).font('Helvetica').fillColor('#334155')
    doc.text(`Credit Note No: ${data.creditNoteNumber}`, 315, 60, { width: 240, align: 'right' })
    doc.text(`Original Invoice: ${data.originalInvoiceNumber}`, 315, 71, { width: 240, align: 'right' })
    doc.text(`Date: ${data.date}`, 315, 82, { width: 240, align: 'right' })
    doc.text(`Booking Ref: #${data.bookingNumber}`, 315, 93, { width: 240, align: 'right' })

    doc.strokeColor('#E2E8F0').lineWidth(0.75).moveTo(40, 106).lineTo(555, 106).stroke()

    doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#64748B').text('ISSUED TO (CLIENT):', 40, 114)
    doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#0F172A').text(data.customerName, 40, 126)
    if (data.customerEmail) doc.fontSize(7.5).font('Helvetica').fillColor('#334155').text(data.customerEmail, 40, 138)

    doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#334155').text(`Reason for Adjustment: ${data.reason}`, 40, 154)

    // Reversal Table
    let y = 172
    doc.rect(40, y, 515, 18).fill('#B91C1C')
    doc.fontSize(7).font('Helvetica-Bold').fillColor('#FFFFFF')
    doc.text('CHARGES CANCELLED / REVERSED', 48, y + 5)
    doc.text('ADJUSTMENT (AUD)', 445, y + 5, { width: 100, align: 'right' })

    y += 18
    doc.font('Helvetica').fontSize(7.5).fillColor('#1E293B')
    for (const item of data.reversedItems) {
      doc.text(item.description, 48, y + 5, { width: 380 })
      doc.text(`-$${fmt(item.amount)}`, 445, y + 5, { width: 100, align: 'right' })
      y += 16
      doc.strokeColor('#F1F5F9').lineWidth(0.5).moveTo(40, y).lineTo(555, y).stroke()
    }

    y += 6
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#B91C1C')
    doc.text('Total Adjustment Credited:', 300, y, { width: 150, align: 'right' })
    doc.text(`-$${fmt(data.totalAdjustment)} AUD`, 445, y, { width: 100, align: 'right' })

    // Refund disposition
    y += 24
    doc.rect(40, y, 515, 68).fill('#FEF2F2').stroke('#FECACA')
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#991B1B').text('REFUND DISPOSITION BREAKDOWN:', 50, y + 8)
    y += 22
    doc.font('Helvetica').fontSize(7.5).fillColor('#334155')
    if (data.walletRefundAmount > 0) {
      doc.text(`• Refunded to Stunner Alert Wallet Credit: $${fmt(data.walletRefundAmount)} AUD`, 50, y)
      y += 12
    }
    if (data.cardRefundAmount > 0) {
      doc.text(`• Refunded to Original Payment Card (Stripe): $${fmt(data.cardRefundAmount)} AUD`, 50, y)
      y += 12
    }
    if (data.voidedAmount > 0) {
      doc.text(`• Uncaptured Balance Released / Voided: $${fmt(data.voidedAmount)} AUD`, 50, y)
    }

    // Footer note
    doc.strokeColor('#E2E8F0').lineWidth(0.5).moveTo(40, 770).lineTo(555, 770).stroke()
    doc.fontSize(7).font('Helvetica').fillColor('#94A3B8')
    doc.text(
      'ATO Compliance: This document serves as an official Adjustment Note for Australian GST purposes. Stunner Alert Pty Ltd.',
      40,
      778,
      { width: 515, align: 'center' }
    )
  })

  return uploadPdfBufferToS3(buffer, 'invoices', `credit-note-${data.bookingNumber}.pdf`)
}

/**
 * Synchronous/Direct helper to generate and save Customer Custom PDF
 * called immediately after booking creation or payment.
 */
export const generateAndSaveBookingCustomPdf = async (bookingId: string) => {
  try {
    const booking = await Booking.findById(bookingId)
      .populate('service')
      .populate('services')
      .populate('customer', 'name email address phone')
      .populate('artist', 'name email businessName abn isGstRegistered')
      .populate('address')

    if (!booking) return null

    const artistProfile = await ArtistProfile.findOne({
      user: (booking.artist as any)?._id || booking.artist,
    })

    const isGst =
      (booking.gstAmount || 0) > 0 ||
      Boolean(artistProfile?.isGstRegistered || (booking.artist as any)?.isGstRegistered)
    const gstRateStr = isGst ? '10.0%' : '0.0%'

    const serviceNames =
      Array.isArray(booking.services) && booking.services.length > 0
        ? booking.services.map((s: any) => s.name).join(', ')
        : (booking.service as any)?.name || 'Beauty Service'

    const guestCount = booking.guestCount || 1
    const unitPrice =
      guestCount > 1
        ? Math.round(((booking.servicePrice || 0) / guestCount) * 100) / 100
        : booking.servicePrice || 0

    const items: Array<{
      description: string
      quantity: number
      unitPrice: number
      amount: number
      gstRate: string
    }> = [
      {
        description: serviceNames,
        quantity: guestCount,
        unitPrice,
        amount: booking.servicePrice || 0,
        gstRate: gstRateStr,
      },
    ]

    if (booking.travelFee > 0) {
      items.push({
        description: 'Mobile Travel Surcharge (Direct Distance)',
        quantity: 1,
        unitPrice: booking.travelFee,
        amount: booking.travelFee,
        gstRate: gstRateStr,
      })
    }
    if (booking.parkingFee > 0) {
      items.push({
        description: 'Parking Fee Reimbursement',
        quantity: 1,
        unitPrice: booking.parkingFee,
        amount: booking.parkingFee,
        gstRate: '0.0%',
      })
    }

    const paymentsApplied: Array<{ label: string; amount: number }> = []
    if (booking.platformCreditApplied > 0) {
      paymentsApplied.push({
        label: 'Stunner Alert Platform Credit (Wallet Applied)',
        amount: booking.platformCreditApplied,
      })
    }
    if (booking.initialPayment?.amount > 0 && booking.initialPayment?.status === 'captured') {
      paymentsApplied.push({
        label: 'Initial 20% Deposit Paid (Card)',
        amount: booking.initialPayment.amount,
      })
    }
    if (booking.balancePayment?.status === 'captured' && booking.balancePayment?.amount > 0) {
      paymentsApplied.push({
        label: 'Final 80% Balance Paid (Card)',
        amount: booking.balancePayment.amount,
      })
    }

    const isPaidInFull = booking.balancePayment?.status === 'captured'
    const isDepositPaid = booking.initialPayment?.status === 'captured'

    let statusText = 'UNPAID / PENDING CONFIRMATION'
    if (isPaidInFull) {
      statusText = 'PAID IN FULL'
    } else if (isDepositPaid) {
      statusText = 'PARTIALLY PAID - DEPOSIT RECEIVED'
    }

    const balanceDue = isPaidInFull ? 0 : booking.balancePayment?.amount || booking.totalBookingPrice
    const currentPaid = paymentsApplied.reduce((acc, p) => acc + p.amount, 0)
    const dueSchedule = {
      currentPaid,
      initialDeposit: booking.initialPayment?.amount || 0,
      balanceDue: booking.balancePayment?.amount || 0,
      totalOutstanding: balanceDue,
    }

    const customPdfUrl = await generateAndUploadCustomerInvoicePdf({
      title: isGst ? 'TAX INVOICE' : 'INVOICE',
      invoiceNumber: `INV-${booking.bookingNumber}`,
      issueDate: moment(booking.createdAt || new Date()).format('DD MMM YYYY'),
      dueDate: moment(booking.balancePayment?.dueDate || new Date()).format('DD MMM YYYY'),
      statusText,
      bookingNumber: booking.bookingNumber,
      appointmentDate: `${moment(booking.bookingDate).format('DD MMM YYYY')} ${booking.startTime}`,
      serviceType: booking.visitType || 'home_visit',
      seller: {
        name: artistProfile?.businessName || (booking.artist as any)?.name || 'Independent Professional',
        businessName: artistProfile?.businessName || (booking.artist as any)?.name || 'Independent Professional',
        abn: artistProfile?.abn || (booking.artist as any)?.abn || null,
        isGstRegistered: isGst,
      },
      buyer: {
        name: (booking.customer as any)?.name || 'Valued Client',
        email: (booking.customer as any)?.email || null,
        address: (booking.address as any)?.address || null,
      },
      items,
      totals: {
        subtotal: booking.grossAmount || booking.servicePrice,
        discount: booking.discountAmount || 0,
        gstAmount: booking.gstAmount || 0,
        totalAmount: booking.totalBookingPrice,
      },
      paymentBreakdown: paymentsApplied,
      dueSchedule,
      balanceDue,
    })

    if (customPdfUrl) {
      booking.customPdf = customPdfUrl
      await Booking.findByIdAndUpdate(booking._id, { customPdf: customPdfUrl })
    }

    return customPdfUrl
  } catch (err: any) {
    logger.warn(`[Direct PDF Generation Error] Booking ${bookingId}: ${err?.message}`)
    return null
  }
}

/**
 * Standalone direct Balance Payment Receipt PDF generator & database updater.
 */
export const generateAndSaveBalanceReceiptPdf = async (bookingId: string) => {
  try {
    const booking = await Booking.findById(bookingId)
      .populate('service')
      .populate('services')
      .populate('customer', 'name email address phone')
      .populate('artist', 'name email businessName abn')
      .populate('address')

    if (!booking) return null
    if (booking.balancePayment?.status !== 'captured') return null

    const artistProfile = await ArtistProfile.findOne({
      user: (booking.artist as any)?._id || booking.artist,
    })

    const serviceName =
      Array.isArray(booking.services) && booking.services.length > 0
        ? booking.services.map((s: any) => s.name).filter(Boolean).join(', ')
        : (booking.service as any)?.name || 'Beauty Service'

    const receiptUrl = await generateAndUploadBalanceReceiptPdf({
      receiptNumber: `RCT-${booking.bookingNumber}-B`,
      bookingNumber: booking.bookingNumber,
      receiptDate: moment(booking.balancePayment?.paidAt || new Date()).format('DD MMM YYYY, hh:mm A'),
      customerName: (booking.customer as any)?.name || 'Valued Client',
      customerEmail: (booking.customer as any)?.email || null,
      artistName:
        artistProfile?.businessName || (booking.artist as any)?.name || 'Independent Professional',
      artistAbn: artistProfile?.abn || (booking.artist as any)?.abn || null,
      serviceName,
      totalBookingPrice: booking.totalBookingPrice,
      priorDepositPaid: (booking.initialPayment?.amount || 0) + (booking.platformCreditApplied || 0),
      amountChargedToday: booking.balancePayment?.amount || 0,
      remainingBalance: 0,
      paymentMethodText: 'Credit Card / Online Tender (Stripe)',
      transactionRef: booking.balancePayment?.stripePaymentIntentId || `TXN-${booking.bookingNumber}-80`,
    })

    if (receiptUrl) {
      booking.customReceiptPdf = receiptUrl
      await Booking.findByIdAndUpdate(booking._id, { customReceiptPdf: receiptUrl })
    }

    return receiptUrl
  } catch (err: any) {
    logger.warn(`[Direct Balance Receipt PDF Error] Booking ${bookingId}: ${err?.message}`)
    return null
  }
}

/**
 * Standalone direct Credit Note PDF generator & database updater.
 */
export const generateAndSaveCreditNotePdf = async (bookingId: string, reason?: string) => {
  try {
    const booking = await Booking.findById(bookingId)
      .populate('service')
      .populate('services')
      .populate('customer', 'name email address phone')
      .populate('artist', 'name email businessName abn')

    if (!booking) return null

    const creditNoteNumber = booking.creditNoteId || `CN-${booking.bookingNumber}`
    const isBalancePaid = booking.balancePayment?.status === 'captured'
    const isInitialPaid = booking.initialPayment?.status === 'captured'

    const creditNoteUrl = await generateAndUploadCreditNotePdf({
      creditNoteNumber,
      originalInvoiceNumber: `INV-${booking.bookingNumber}`,
      bookingNumber: booking.bookingNumber,
      date: moment(booking.cancelledAt || new Date()).format('DD MMM YYYY'),
      customerName: (booking.customer as any)?.name || 'Valued Client',
      customerEmail: (booking.customer as any)?.email || null,
      reason: reason || booking.cancellationReason || 'Booking cancelled',
      reversedItems: [
        {
          description: 'Core Service Booking (Cancelled)',
          amount: booking.servicePrice || 0,
          gstRate: (booking.gstAmount || 0) > 0 ? '10%' : '0%',
        },
        ...(booking.travelFee > 0
          ? [
              {
                description: 'Mobile Travel Surcharge (Cancelled)',
                amount: booking.travelFee,
                gstRate: (booking.gstAmount || 0) > 0 ? '10%' : '0%',
              },
            ]
          : []),
      ],
      totalAdjustment: booking.totalBookingPrice,
      walletRefundAmount: booking.platformCreditIssued || 0,
      cardRefundAmount: 0,
      voidedAmount: isBalancePaid ? 0 : booking.balancePayment?.amount || 0,
    })

    if (creditNoteUrl) {
      booking.customCreditNotePdf = creditNoteUrl
      booking.creditNotePdfUrl = creditNoteUrl
      booking.creditNoteId = creditNoteNumber
      await Booking.findByIdAndUpdate(booking._id, {
        customCreditNotePdf: creditNoteUrl,
        creditNotePdfUrl: creditNoteUrl,
        creditNoteId: creditNoteNumber,
      })
    }

    return creditNoteUrl
  } catch (err: any) {
    logger.warn(`[Direct Credit Note PDF Error] Booking ${bookingId}: ${err?.message}`)
    return null
  }
}
