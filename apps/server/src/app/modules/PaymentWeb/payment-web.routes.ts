import express, { type Router } from 'express'
import { renderPaymentSuccess, renderPaymentCancel } from './payment-web.controllers'

const router: Router = express.Router()

// Web pages for Stripe redirect
router.get('/success', renderPaymentSuccess)
router.get('/cancel', renderPaymentCancel)

export const paymentWebRoutes: Router = router

// Directly referred URLs (independent of .env)
export const PAYMENT_SUCCESS_URL = 'https://backend.stunneralert.com/payment/success'
export const PAYMENT_CANCEL_URL = 'https://backend.stunneralert.com/payment/cancel'
