import type { Request, Response } from 'express'
import configs from '@app/configs'

const siteName = configs.site.name || 'Stunner Alert'
const siteLogo =
  configs.site.logo ||
  'https://stunneralert.s3.ap-southeast-2.amazonaws.com/stunner-static/stunner-alert.webp'

// Base HTML layout
const getBaseHtml = (title: string, content: string) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title} | ${siteName}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    body {
      background: radial-gradient(circle at 50% 0%, #FDF4FF 0%, #F8FAFC 60%, #F1F5F9 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px 16px;
      color: #0F172A;
    }
    .card {
      background: #FFFFFF;
      max-width: 480px;
      width: 100%;
      border-radius: 28px;
      padding: 40px 32px;
      box-shadow: 0 25px 50px -12px rgba(15, 23, 42, 0.08), 0 0 0 1px rgba(226, 232, 240, 0.8);
      text-align: center;
      position: relative;
      overflow: hidden;
    }
    .brand-header {
      margin-bottom: 28px;
      display: flex;
      justify-content: center;
      align-items: center;
    }
    .brand-logo {
      height: 44px;
      max-width: 180px;
      object-fit: contain;
    }
    .brand-fallback {
      font-size: 20px;
      font-weight: 800;
      letter-spacing: -0.5px;
      color: #1E1B4B;
      background: linear-gradient(135deg, #7C3AED 0%, #EC4899 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .icon-wrapper {
      width: 88px;
      height: 88px;
      border-radius: 50%;
      margin: 0 auto 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
    }
    .icon-success {
      background: linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%);
      color: #059669;
      box-shadow: 0 10px 25px -5px rgba(16, 185, 129, 0.3);
    }
    .icon-cancel {
      background: linear-gradient(135deg, #FFF1F2 0%, #FFE4E6 100%);
      color: #E11D48;
      box-shadow: 0 10px 25px -5px rgba(244, 63, 94, 0.3);
    }
    .title {
      font-size: 26px;
      font-weight: 800;
      letter-spacing: -0.5px;
      color: #0F172A;
      margin-bottom: 8px;
    }
    .subtitle {
      font-size: 15px;
      color: #64748B;
      line-height: 1.5;
      margin-bottom: 28px;
    }
    .details-box {
      background: #F8FAFC;
      border: 1px solid #E2E8F0;
      border-radius: 18px;
      padding: 18px 20px;
      margin-bottom: 28px;
      text-align: left;
    }
    .detail-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 0;
      font-size: 14px;
      border-bottom: 1px dashed #E2E8F0;
    }
    .detail-row:last-child {
      border-bottom: none;
      padding-bottom: 0;
    }
    .detail-row:first-child {
      padding-top: 0;
    }
    .detail-label {
      color: #64748B;
      font-weight: 500;
    }
    .detail-value {
      color: #0F172A;
      font-weight: 600;
      text-align: right;
      max-width: 60%;
      word-break: break-all;
    }
    .badge {
      display: inline-block;
      padding: 3px 10px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.3px;
      text-transform: uppercase;
    }
    .badge-success {
      background: #DCFCE7;
      color: #15803D;
    }
    .badge-cancel {
      background: #FFE4E6;
      color: #BE123C;
    }
    .actions {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 14px 24px;
      border-radius: 14px;
      font-size: 15px;
      font-weight: 700;
      text-decoration: none;
      cursor: pointer;
      transition: all 0.2s ease;
      border: none;
      width: 100%;
    }
    .btn-primary {
      background: linear-gradient(135deg, #1E1B4B 0%, #312E81 100%);
      color: #FFFFFF;
      box-shadow: 0 10px 20px -5px rgba(30, 27, 75, 0.25);
    }
    .btn-primary:hover {
      opacity: 0.95;
      transform: translateY(-1px);
    }
    .btn-secondary {
      background: #F1F5F9;
      color: #475569;
    }
    .btn-secondary:hover {
      background: #E2E8F0;
      color: #1E293B;
    }
    .footer-note {
      font-size: 12px;
      color: #94A3B8;
      margin-top: 24px;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="brand-header">
      ${
        siteLogo
          ? `<img src="${siteLogo}" alt="${siteName}" class="brand-logo" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';" />
             <div class="brand-fallback" style="display:none;">${siteName}</div>`
          : `<div class="brand-fallback">${siteName}</div>`
      }
    </div>
    ${content}
    <div class="footer-note">
      &copy; ${new Date().getFullYear()} ${siteName}. All rights reserved.
    </div>
  </div>
</body>
</html>`

// Render Payment Success Page
export const renderPaymentSuccess = (req: Request, res: Response) => {
  const { session_id, bookingNumber, penaltyId, type } = req.query

  const isPenalty = type === 'penalty_success' || Boolean(penaltyId)
  const transactionType = isPenalty ? 'Penalty Settlement' : 'Booking Payment'
  const refNumber = (bookingNumber as string) || (penaltyId as string) || (session_id as string)

  const content = `
    <div class="icon-wrapper icon-success">
      <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
        <polyline points="22 4 12 14.01 9 11.01"></polyline>
      </svg>
    </div>
    <h1 class="title">Payment Successful!</h1>
    <p class="subtitle">Thank you! Your transaction has been completed and verified successfully.</p>

    <div class="details-box">
      <div class="detail-row">
        <span class="detail-label">Status</span>
        <span class="detail-value"><span class="badge badge-success">Paid</span></span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Payment For</span>
        <span class="detail-value">${transactionType}</span>
      </div>
      ${
        bookingNumber
          ? `<div class="detail-row">
              <span class="detail-label">Booking Ref</span>
              <span class="detail-value">#${bookingNumber}</span>
            </div>`
          : ''
      }
      ${
        penaltyId && !bookingNumber
          ? `<div class="detail-row">
              <span class="detail-label">Penalty Ref</span>
              <span class="detail-value">#${String(penaltyId).slice(-8).toUpperCase()}</span>
            </div>`
          : ''
      }
      ${
        session_id && !bookingNumber && !penaltyId
          ? `<div class="detail-row">
              <span class="detail-label">Session ID</span>
              <span class="detail-value">${String(session_id).slice(0, 16)}...</span>
            </div>`
          : ''
      }
      <div class="detail-row">
        <span class="detail-label">Date & Time</span>
        <span class="detail-value">${new Date().toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })}</span>
      </div>
    </div>

    <div class="actions">
      <a href="stunneralert://payment-result?status=success${refNumber ? `&ref=${refNumber}` : ''}" class="btn btn-primary" onclick="handleDeepLink(event, this.href)">
        Return to App
      </a>
      <button type="button" class="btn btn-secondary" onclick="window.close()">
        Close Window
      </button>
    </div>

    <script>
      function handleDeepLink(e, url) {
        // Attempt deep link into native app, fallback to website if not on mobile
        window.location.href = url;
        setTimeout(function() {
          window.location.href = 'https://stunneralert.com.au';
        }, 1500);
      }
    </script>
  `

  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self' 'unsafe-inline' https: data:; img-src https: data:; font-src https: data:;"
  )
  res.status(200).send(getBaseHtml('Payment Successful', content))
}

// Render Payment Cancel Page
export const renderPaymentCancel = (req: Request, res: Response) => {
  const { bookingNumber, penaltyId, type } = req.query

  const isPenalty = type === 'penalty_cancel' || Boolean(penaltyId)
  const transactionType = isPenalty ? 'Penalty Settlement' : 'Booking Payment'

  const content = `
    <div class="icon-wrapper icon-cancel">
      <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="15" y1="9" x2="9" y2="15"></line>
        <line x1="9" y1="9" x2="15" y2="15"></line>
      </svg>
    </div>
    <h1 class="title">Payment Cancelled</h1>
    <p class="subtitle">Your transaction was not completed and your card was not charged.</p>

    <div class="details-box">
      <div class="detail-row">
        <span class="detail-label">Status</span>
        <span class="detail-value"><span class="badge badge-cancel">Cancelled</span></span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Payment For</span>
        <span class="detail-value">${transactionType}</span>
      </div>
      ${
        bookingNumber
          ? `<div class="detail-row">
              <span class="detail-label">Booking Ref</span>
              <span class="detail-value">#${bookingNumber}</span>
            </div>`
          : ''
      }
      ${
        penaltyId && !bookingNumber
          ? `<div class="detail-row">
              <span class="detail-label">Penalty Ref</span>
              <span class="detail-value">#${String(penaltyId).slice(-8).toUpperCase()}</span>
            </div>`
          : ''
      }
      <div class="detail-row">
        <span class="detail-label">Notice</span>
        <span class="detail-value" style="color: #64748B; font-weight: 500;">You can retry from the app.</span>
      </div>
    </div>

    <div class="actions">
      <a href="stunneralert://payment-result?status=cancelled" class="btn btn-primary" onclick="handleDeepLink(event, this.href)">
        Return to App
      </a>
      <button type="button" class="btn btn-secondary" onclick="window.close()">
        Close Window
      </button>
    </div>

    <script>
      function handleDeepLink(e, url) {
        window.location.href = url;
        setTimeout(function() {
          window.location.href = 'https://stunneralert.com.au';
        }, 1500);
      }
    </script>
  `

  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self' 'unsafe-inline' https: data:; img-src https: data:; font-src https: data:;"
  )
  res.status(200).send(getBaseHtml('Payment Cancelled', content))
}
