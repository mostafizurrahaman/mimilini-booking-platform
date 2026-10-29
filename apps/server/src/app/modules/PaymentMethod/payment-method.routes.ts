import express, { Router } from 'express'
import { validateRequest } from '@app/middlewares'
import { paymentMethodControllers } from './payment-method.controllers'
import { paymentMethodValidations } from './payment-method.validations'
import { AuthRoles } from 'packages/db/src'
import { auth } from '@app/middlewares/auth'

const router: Router = express.Router()

router.post('/setup-intent', auth(AuthRoles.CUSTOMER), paymentMethodControllers.setupIntent)

router.post(
  '/add',
  auth(AuthRoles.CUSTOMER),
  validateRequest(paymentMethodValidations.addPaymentMethodSchema),
  paymentMethodControllers.addPaymentMethod
)

router.patch(
  '/:id/mark-as-default',
  auth(AuthRoles.CUSTOMER),
  validateRequest(paymentMethodValidations.markAsDefaultSchema),
  paymentMethodControllers.markAsDefault
)

router.get(
  '/all',
  auth(AuthRoles.CUSTOMER),
  validateRequest(paymentMethodValidations.getAllPaymentMethodSchema),
  paymentMethodControllers.getAllPaymentMethod
)

router.get(
  '/:id',
  auth(AuthRoles.CUSTOMER),
  validateRequest(paymentMethodValidations.getPaymentMethodByIdSchema),
  paymentMethodControllers.getPaymentMethodById
)

router.delete(
  '/:id',
  auth(AuthRoles.CUSTOMER),
  validateRequest(paymentMethodValidations.deletePaymentMethodByIdSchema),
  paymentMethodControllers.deletePaymentMethodById
)

export const paymentMethodRoutes = router
