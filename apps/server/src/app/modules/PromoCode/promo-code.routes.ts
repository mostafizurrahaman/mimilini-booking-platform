import express, { Router } from 'express'
import { validateRequest } from '@app/middlewares'
import { promoCodeControllers } from './promo-code.controllers'
import { promoCodeValidations } from './promo-code.validations'
import { auth } from '@app/middlewares/auth'
import { AuthRoles } from '@repo/db'

const router: Router = express.Router()

// 1. Create promo code (Artist, Admin, Super Admin)
router.post(
  '/',
  auth(AuthRoles.ARTIST, AuthRoles.ADMIN, AuthRoles.SUPER_ADMIN),
  validateRequest(promoCodeValidations.createPromoCodeSchema),
  promoCodeControllers.createPromoCode
)

// 2. Validate promo code at checkout (Customer, Artist, Admin, etc.)
router.post(
  '/validate',
  auth(),
  validateRequest(promoCodeValidations.validatePromoCodeSchema),
  promoCodeControllers.validatePromoCode
)

// 3. Artist promo codes dashboard (Artist)
router.get(
  '/my',
  auth(AuthRoles.ARTIST),
  validateRequest(promoCodeValidations.getMyPromoCodesSchema),
  promoCodeControllers.getMyPromoCodes
)

// 4. Get all promo codes (Admin, Super Admin)
router.get(
  '/all',
  auth(AuthRoles.ADMIN, AuthRoles.SUPER_ADMIN),
  validateRequest(promoCodeValidations.getAllPromoCodeSchema),
  promoCodeControllers.getAllPromoCode
)

// 5. Update promo code status (Pause / Activate / Expire)
router.patch(
  '/:id/status',
  auth(AuthRoles.ARTIST, AuthRoles.ADMIN, AuthRoles.SUPER_ADMIN),
  validateRequest(promoCodeValidations.updatePromoCodeStatusSchema),
  promoCodeControllers.updatePromoCodeStatus
)

// 6. Update promo code details
router.patch(
  '/:id',
  auth(AuthRoles.ARTIST, AuthRoles.ADMIN, AuthRoles.SUPER_ADMIN),
  validateRequest(promoCodeValidations.updatePromoCodeSchema),
  promoCodeControllers.updatePromoCode
)

// 7. Get promo code by ID
router.get(
  '/:id',
  auth(),
  validateRequest(promoCodeValidations.getPromoCodeByIdSchema),
  promoCodeControllers.getPromoCodeById
)

// 8. Delete promo code by ID
router.delete(
  '/:id',
  auth(AuthRoles.ARTIST, AuthRoles.ADMIN, AuthRoles.SUPER_ADMIN),
  validateRequest(promoCodeValidations.deletePromoCodeByIdSchema),
  promoCodeControllers.deletePromoCodeById
)

export const promoCodeRoutes = router
