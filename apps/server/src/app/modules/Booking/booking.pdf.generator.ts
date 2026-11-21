import PDFDocument from 'pdfkit'
import { uploadBufferToS3 } from 'packages/media-hub/src'
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
  balanceDue?: number
  footerNote?: string
}

export interface IRctiPdfData {
  invoiceNumber: string
  issueDate: string
  bookingNumber: string
  recipient: {
    name: string
    abn: string
    email: string
  }
  supplier: {
    name: string
    businessName: string
    abn?: string | null
    isGstRegistered: boolean
  }
  collections: Array<{
    description: string
    amount: number
  }>
  totalGrossCollection: number
  deductions: Array<{
    description: string
    amount: number
  }>
  totalDeductions: number
  netPayout: number
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
    doc.fontSize(22).font('Helvetica-Bold').fillColor('#1A1A1A').text('STUNNER ALERT', 40, 40)
    doc.fontSize(9).font('Helvetica').fillColor('#555555').text('Stunner Alert Pty Ltd | ABN: 88 701 443 129', 40, 68)
    doc.text('billing@stunneralert.com | Sydney, Australia', 40, 80)

    doc.fontSize(16).font('Helvetica-Bold').fillColor('#1A1A1A').text(data.title, 360, 40, { align: 'right' })
    doc.fontSize(9).font('Helvetica').fillColor('#333333')
    doc.text(`Invoice No: ${data.invoiceNumber}`, 360, 65, { align: 'right' })
    doc.text(`Issue Date: ${data.issueDate}`, 360, 78, { align: 'right' })
    if (data.dueDate) {
      doc.text(`Due Date: ${data.dueDate}`, 360, 91, { align: 'right' })
    }

    doc.strokeColor('#DDDDDD').lineWidth(1).moveTo(40, 115).lineTo(555, 115).stroke()

    // Parties
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#1A1A1A').text('SERVICE PROFESSIONAL:', 40, 125)
    doc.fontSize(9).font('Helvetica').fillColor('#333333')
    doc.text(data.seller.businessName || data.seller.name, 40, 140)
    if (data.seller.abn) {
      doc.text(`ABN: ${data.seller.abn}`, 40, 153)
    }
    doc.text(`GST Registered: ${data.seller.isGstRegistered ? 'YES' : 'NO'}`, 40, 166)

    doc.fontSize(10).font('Helvetica-Bold').fillColor('#1A1A1A').text('CLIENT (BILLED TO):', 320, 125)
    doc.fontSize(9).font('Helvetica').fillColor('#333333')
    doc.text(data.buyer.name, 320, 140)
    if (data.buyer.email) doc.text(data.buyer.email, 320, 153)
    if (data.buyer.address) doc.text(data.buyer.address, 320, 166, { width: 220 })

    // Status Banner
    doc.rect(40, 195, 515, 24).fillAndStroke('#F4F6F8', '#E1E4E8')
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#24292E')
    doc.text(`STATUS: ${data.statusText}  |  BOOKING REF: #${data.bookingNumber}  |  APPOINTMENT: ${data.appointmentDate}`, 48, 202)

    // Table Header
    let y = 235
    doc.rect(40, y, 515, 20).fill('#212529')
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#FFFFFF')
    doc.text('DESCRIPTION', 48, y + 5)
    doc.text('QTY', 330, y + 5, { width: 40, align: 'center' })
    doc.text('UNIT PRICE', 390, y + 5, { width: 70, align: 'right' })
    doc.text('TOTAL AUD', 480, y + 5, { width: 70, align: 'right' })

    // Table Rows
    y += 20
    doc.font('Helvetica').fontSize(9).fillColor('#333333')
    for (const item of data.items) {
      doc.text(item.description, 48, y + 6, { width: 270 })
      doc.text(item.quantity.toString(), 330, y + 6, { width: 40, align: 'center' })
      doc.text(`$${item.unitPrice.toFixed(2)}`, 390, y + 6, { width: 70, align: 'right' })
      doc.text(`$${item.amount.toFixed(2)}`, 480, y + 6, { width: 70, align: 'right' })
      y += 22
      doc.strokeColor('#EEEEEE').lineWidth(0.5).moveTo(40, y).lineTo(555, y).stroke()
    }

    // Totals
    y += 10
    doc.text('Subtotal:', 360, y, { width: 100, align: 'right' })
    doc.text(`$${data.totals.subtotal.toFixed(2)}`, 480, y, { width: 70, align: 'right' })

    if (data.totals.discount && data.totals.discount > 0) {
      y += 15
      doc.text('Promo Discount:', 360, y, { width: 100, align: 'right' })
      doc.text(`-$${data.totals.discount.toFixed(2)}`, 480, y, { width: 70, align: 'right' })
    }

    y += 15
    doc.text(data.seller.isGstRegistered ? 'GST (10% inc):' : 'GST (0% Not Registered):', 340, y, { width: 120, align: 'right' })
    doc.text(`$${data.totals.gstAmount.toFixed(2)}`, 480, y, { width: 70, align: 'right' })

    y += 18
    doc.rect(340, y - 4, 215, 24).fill('#E8F4FD')
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#0B4F8A')
    doc.text('Total Booking Price:', 350, y + 2)
    doc.text(`$${data.totals.totalAmount.toFixed(2)} AUD`, 450, y + 2, { width: 100, align: 'right' })

    // Payment Ledger
    if (data.paymentBreakdown && data.paymentBreakdown.length > 0) {
      y += 35
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#1A1A1A').text('PAYMENTS APPLIED & TENDER BREAKDOWN:', 40, y)
      y += 14
      doc.font('Helvetica').fontSize(9).fillColor('#444444')
      for (const p of data.paymentBreakdown) {
        doc.text(`• ${p.label}`, 50, y)
        doc.text(`-$${p.amount.toFixed(2)}`, 480, y, { width: 70, align: 'right' })
        y += 14
      }
    }

    if (data.balanceDue !== undefined) {
      y += 6
      doc.font('Helvetica-Bold').fontSize(9).fillColor(data.balanceDue > 0 ? '#C02A2A' : '#1C7430')
      doc.text('BALANCE DUE / OUTSTANDING:', 50, y)
      doc.text(`$${data.balanceDue.toFixed(2)} AUD`, 480, y, { width: 70, align: 'right' })
    }

    // Footer note
    doc.fontSize(8).font('Helvetica').fillColor('#777777')
    doc.text(
      data.footerNote ||
        'Total price includes Australian GST where applicable. All transactions are in Australian Dollars (AUD). Issued by Stunner Alert Pty Ltd.',
      40,
      760,
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
    doc.fontSize(20).font('Helvetica-Bold').fillColor('#1A1A1A').text('STUNNER ALERT', 40, 40)
    doc.fontSize(9).font('Helvetica').fillColor('#555555').text('Mimilini Pty Ltd t/a Stunner Alert', 40, 65)
    doc.text(`ABN: ${data.recipient.abn} | ${data.recipient.email}`, 40, 78)

    doc.fontSize(13).font('Helvetica-Bold').fillColor('#1A1A1A').text('RECIPIENT CREATED TAX INVOICE (RCTI)', 280, 40, { align: 'right' })
    doc.fontSize(9).font('Helvetica').fillColor('#333333')
    doc.text(`RCTI Number: ${data.invoiceNumber}`, 320, 65, { align: 'right' })
    doc.text(`Issue Date: ${data.issueDate}`, 320, 78, { align: 'right' })
    doc.text(`Booking Ref: #${data.bookingNumber}`, 320, 91, { align: 'right' })

    doc.strokeColor('#DDDDDD').lineWidth(1).moveTo(40, 115).lineTo(555, 115).stroke()

    // Professional
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#1A1A1A').text('SUPPLIER / SERVICE PROFESSIONAL:', 40, 125)
    doc.fontSize(9).font('Helvetica').fillColor('#333333')
    doc.text(data.supplier.businessName || data.supplier.name, 40, 140)
    if (data.supplier.abn) doc.text(`ABN: ${data.supplier.abn}`, 40, 153)
    doc.text(`GST Registered: ${data.supplier.isGstRegistered ? 'YES' : 'NO'}`, 40, 166)

    // Gross Collections Section
    let y = 195
    doc.rect(40, y, 515, 20).fill('#212529')
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#FFFFFF')
    doc.text('SECTION A: GROSS CLIENT COLLECTION (ON YOUR BEHALF)', 48, y + 5)
    doc.text('AMOUNT (AUD)', 470, y + 5, { width: 80, align: 'right' })

    y += 20
    doc.font('Helvetica').fontSize(9).fillColor('#333333')
    for (const c of data.collections) {
      doc.text(c.description, 48, y + 6, { width: 400 })
      doc.text(`$${c.amount.toFixed(2)}`, 470, y + 6, { width: 80, align: 'right' })
      y += 20
      doc.strokeColor('#EEEEEE').lineWidth(0.5).moveTo(40, y).lineTo(555, y).stroke()
    }
    y += 4
    doc.font('Helvetica-Bold')
    doc.text('Total Gross Collection:', 320, y, { width: 140, align: 'right' })
    doc.text(`$${data.totalGrossCollection.toFixed(2)}`, 470, y, { width: 80, align: 'right' })

    // Deductions Section
    y += 28
    doc.rect(40, y, 515, 20).fill('#495057')
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#FFFFFF')
    doc.text('SECTION B: DEDUCTIONS & PLATFORM FACILITATION FEES', 48, y + 5)
    doc.text('DEDUCTION', 470, y + 5, { width: 80, align: 'right' })

    y += 20
    doc.font('Helvetica').fontSize(9).fillColor('#333333')
    for (const d of data.deductions) {
      doc.text(d.description, 48, y + 6, { width: 400 })
      doc.text(`-$${d.amount.toFixed(2)}`, 470, y + 6, { width: 80, align: 'right' })
      y += 20
      doc.strokeColor('#EEEEEE').lineWidth(0.5).moveTo(40, y).lineTo(555, y).stroke()
    }
    y += 4
    doc.font('Helvetica-Bold')
    doc.text('Total Platform Deductions:', 300, y, { width: 160, align: 'right' })
    doc.text(`-$${data.totalDeductions.toFixed(2)}`, 470, y, { width: 80, align: 'right' })

    // Net Payout Box
    y += 28
    doc.rect(40, y, 515, 34).fill('#E8F8F0').stroke('#B7EBCE')
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#0E6251')
    doc.text('NET PROFESSIONAL DISBURSEMENT (TRANSFERRED):', 50, y + 10)
    doc.text(`$${data.netPayout.toFixed(2)} AUD`, 440, y + 10, { width: 105, align: 'right' })

    y += 45
    doc.font('Helvetica').fontSize(9).fillColor('#333333')
    doc.text(`Payout Status: ${data.payoutStatus}`, 50, y)
    if (data.transferId) {
      doc.text(`Stripe Transfer ID: ${data.transferId}`, 50, y + 14)
    }

    // RCTI Legal Agreement
    doc.fontSize(7.5).font('Helvetica').fillColor('#777777')
    doc.text(
      'RCTI AGREEMENT & ATO DECLARATION: Issued by Mimilini Pty Ltd t/a Stunner Alert under Australian Recipient Created Tax Invoice (RCTI) guidelines. The recipient and the supplier agree that the recipient can issue tax invoices in respect of the supplies. The supplier will not issue tax invoices in respect of the supplies. The supplier acknowledges that it is registered for GST where stated and will notify the recipient if it ceases to be registered.',
      40,
      740,
      { width: 515, align: 'justify' }
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
    doc.fontSize(22).font('Helvetica-Bold').fillColor('#1A1A1A').text('STUNNER ALERT', 40, 40)
    doc.fontSize(9).font('Helvetica').fillColor('#555555').text('Stunner Alert Pty Ltd | ABN: 88 701 443 129', 40, 68)

    doc.fontSize(16).font('Helvetica-Bold').fillColor('#1A1A1A').text('PAYMENT RECEIPT', 360, 40, { align: 'right' })
    doc.fontSize(9).font('Helvetica').fillColor('#333333')
    doc.text(`Receipt No: ${data.receiptNumber}`, 360, 65, { align: 'right' })
    doc.text(`Receipt Date: ${data.receiptDate}`, 360, 78, { align: 'right' })
    doc.text(`Booking Ref: #${data.bookingNumber}`, 360, 91, { align: 'right' })

    doc.strokeColor('#DDDDDD').lineWidth(1).moveTo(40, 115).lineTo(555, 115).stroke()

    doc.fontSize(10).font('Helvetica-Bold').fillColor('#1A1A1A').text('PAYMENT BY:', 40, 125)
    doc.fontSize(9).font('Helvetica').fillColor('#333333').text(data.customerName, 40, 140)
    if (data.customerEmail) doc.text(data.customerEmail, 40, 153)

    doc.fontSize(10).font('Helvetica-Bold').fillColor('#1A1A1A').text('PROFESSIONAL PROVIDER:', 320, 125)
    doc.fontSize(9).font('Helvetica').fillColor('#333333').text(data.artistName, 320, 140)
    if (data.artistAbn) doc.text(`ABN: ${data.artistAbn}`, 320, 153)

    // Transaction Details
    let y = 185
    doc.rect(40, y, 515, 20).fill('#212529')
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#FFFFFF')
    doc.text('FINAL 80% BALANCE SETTLEMENT DETAILS', 48, y + 5)

    y += 25
    doc.font('Helvetica').fontSize(9).fillColor('#333333')
    doc.text(`• Service: ${data.serviceName}`, 48, y)
    y += 16
    doc.text(`• Payment Tender: ${data.paymentMethodText}`, 48, y)
    y += 16
    doc.text(`• Gateway Transaction ID: ${data.transactionRef}`, 48, y)

    y += 30
    doc.rect(40, y, 515, 90).fill('#F8F9FA').stroke('#E9ECEF')
    doc.font('Helvetica').fontSize(9).fillColor('#333333')
    doc.text('Total Booking Value:', 55, y + 12)
    doc.text(`$${data.totalBookingPrice.toFixed(2)} AUD`, 460, y + 12, { width: 85, align: 'right' })

    doc.text('Less: Prior Deposit Paid (20%):', 55, y + 30)
    doc.text(`-$${data.priorDepositPaid.toFixed(2)} AUD`, 460, y + 30, { width: 85, align: 'right' })

    doc.font('Helvetica-Bold').fillColor('#0E6251')
    doc.text('Amount Charged Today (80% Balance):', 55, y + 48)
    doc.text(`$${data.amountChargedToday.toFixed(2)} AUD`, 460, y + 48, { width: 85, align: 'right' })

    doc.font('Helvetica-Bold').fillColor('#1C7430')
    doc.text('Outstanding Remaining Balance:', 55, y + 66)
    doc.text(`$${data.remainingBalance.toFixed(2)} AUD [ PAID IN FULL ]`, 380, y + 66, { width: 165, align: 'right' })

    doc.fontSize(8).font('Helvetica').fillColor('#777777')
    doc.text(
      'Thank you for your payment. Your appointment is now confirmed and settled. Stunner Alert Pty Ltd.',
      40,
      760,
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
    doc.fontSize(22).font('Helvetica-Bold').fillColor('#1A1A1A').text('STUNNER ALERT', 40, 40)
    doc.fontSize(9).font('Helvetica').fillColor('#555555').text('Stunner Alert Pty Ltd | ABN: 88 701 443 129', 40, 68)

    doc.fontSize(15).font('Helvetica-Bold').fillColor('#C02A2A').text('ADJUSTMENT / CREDIT NOTE', 300, 40, { align: 'right' })
    doc.fontSize(9).font('Helvetica').fillColor('#333333')
    doc.text(`Credit Note No: ${data.creditNoteNumber}`, 320, 65, { align: 'right' })
    doc.text(`Original Invoice: ${data.originalInvoiceNumber}`, 320, 78, { align: 'right' })
    doc.text(`Date: ${data.date}`, 320, 91, { align: 'right' })
    doc.text(`Booking Ref: #${data.bookingNumber}`, 320, 104, { align: 'right' })

    doc.strokeColor('#DDDDDD').lineWidth(1).moveTo(40, 125).lineTo(555, 125).stroke()

    doc.fontSize(10).font('Helvetica-Bold').fillColor('#1A1A1A').text('ISSUED TO (CLIENT):', 40, 135)
    doc.fontSize(9).font('Helvetica').fillColor('#333333').text(data.customerName, 40, 150)
    if (data.customerEmail) doc.text(data.customerEmail, 40, 163)

    doc.fontSize(9).font('Helvetica-Bold').fillColor('#333333').text(`Reason for Adjustment: ${data.reason}`, 40, 185)

    // Reversal Table
    let y = 205
    doc.rect(40, y, 515, 20).fill('#C02A2A')
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#FFFFFF')
    doc.text('CHARGES CANCELLED / REVERSED', 48, y + 5)
    doc.text('ADJUSTMENT (AUD)', 450, y + 5, { width: 100, align: 'right' })

    y += 20
    doc.font('Helvetica').fontSize(9).fillColor('#333333')
    for (const item of data.reversedItems) {
      doc.text(item.description, 48, y + 6, { width: 380 })
      doc.text(`-$${item.amount.toFixed(2)}`, 450, y + 6, { width: 100, align: 'right' })
      y += 20
      doc.strokeColor('#EEEEEE').lineWidth(0.5).moveTo(40, y).lineTo(555, y).stroke()
    }

    y += 10
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#C02A2A')
    doc.text('Total Adjustment Credited:', 300, y, { width: 150, align: 'right' })
    doc.text(`-$${data.totalAdjustment.toFixed(2)} AUD`, 450, y, { width: 100, align: 'right' })

    // Refund disposition
    y += 35
    doc.rect(40, y, 515, 80).fill('#FDF7F7').stroke('#F5C6CB')
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#721C24').text('REFUND DISPOSITION BREAKDOWN:', 50, y + 10)
    y += 26
    doc.font('Helvetica').fontSize(9).fillColor('#333333')
    if (data.walletRefundAmount > 0) {
      doc.text(`• Refunded to Stunner Alert Wallet Credit: $${data.walletRefundAmount.toFixed(2)} AUD`, 50, y)
      y += 15
    }
    if (data.cardRefundAmount > 0) {
      doc.text(`• Refunded to Original Payment Card (Stripe): $${data.cardRefundAmount.toFixed(2)} AUD`, 50, y)
      y += 15
    }
    if (data.voidedAmount > 0) {
      doc.text(`• Uncaptured Balance Released / Voided: $${data.voidedAmount.toFixed(2)} AUD`, 50, y)
    }

    doc.fontSize(8).font('Helvetica').fillColor('#777777')
    doc.text(
      'ATO Compliance: This document serves as an official Adjustment Note for Australian GST purposes. Stunner Alert Pty Ltd.',
      40,
      760,
      { width: 515, align: 'center' }
    )
  })

  return uploadPdfBufferToS3(buffer, 'invoices', `credit-note-${data.bookingNumber}.pdf`)
}
