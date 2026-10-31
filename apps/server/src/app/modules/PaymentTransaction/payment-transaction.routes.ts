import express, { Router } from 'express'
import { auth } from '@app/middlewares/auth'
import { validateRequest } from '@app/middlewares'
import { AuthRoles } from '@repo/db'
import { paymentTransactionControllers } from './payment-transaction.controllers'
import { paymentTransactionValidations } from './payment-transaction.validations'

const router: Router = express.Router()

// Customer payment transactions (charges, 20% deposit, 80% balance, refunds)
router.get(
  '/customer',
  auth(AuthRoles.CUSTOMER, AuthRoles.ADMIN, AuthRoles.SUPER_ADMIN),
  validateRequest(paymentTransactionValidations.getCustomerTransactionsQuerySchema),
  paymentTransactionControllers.getCustomerTransactions
)

// Artist earnings and payout transactions (Stripe transfers, net payout, deductions)
router.get(
  '/artist',
  auth(AuthRoles.ARTIST, AuthRoles.ADMIN, AuthRoles.SUPER_ADMIN),
  validateRequest(paymentTransactionValidations.getArtistTransactionsQuerySchema),
  paymentTransactionControllers.getArtistTransactions
)

// Dynamic transaction history based on logged-in user role
router.get(
  '/my-transactions',
  auth(AuthRoles.CUSTOMER, AuthRoles.ARTIST, AuthRoles.ADMIN, AuthRoles.SUPER_ADMIN),
  validateRequest(paymentTransactionValidations.getCustomerTransactionsQuerySchema),
  paymentTransactionControllers.getMyTransactions
)

export const paymentTransactionRoutes = router

