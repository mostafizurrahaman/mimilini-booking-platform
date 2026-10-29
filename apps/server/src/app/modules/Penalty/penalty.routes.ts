import express, { Router } from 'express'
import { auth } from '@app/middlewares/auth'
import { AuthRoles } from '@repo/db'
import { penaltyControllers } from './penalty.controllers'

const router: Router = express.Router()

router.get(
  '/my-penalties',
  auth(AuthRoles.ARTIST),
  penaltyControllers.getMyPenalties
)

router.post(
  '/:id/pay',
  auth(AuthRoles.ARTIST),
  penaltyControllers.createPenaltyCheckoutSession
)

router.post(
  '/:id/checkout-session',
  auth(AuthRoles.ARTIST),
  penaltyControllers.createPenaltyCheckoutSession
)

router.get(
  '/',
  auth(AuthRoles.ADMIN, AuthRoles.SUPER_ADMIN),
  penaltyControllers.getAllPenalties
)

router.post(
  '/:id/waive',
  auth(AuthRoles.ADMIN, AuthRoles.SUPER_ADMIN),
  penaltyControllers.waivePenalty
)

export const penaltyRoutes = router
