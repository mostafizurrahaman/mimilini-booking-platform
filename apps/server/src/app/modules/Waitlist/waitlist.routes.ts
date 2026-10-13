import express, { Router } from 'express'
import { validateRequest } from '@app/middlewares'
import { waitlistControllers } from './waitlist.controllers'
import { waitlistValidations } from './waitlist.validations'
import { auth } from '@app/middlewares/auth'
import { AuthRoles } from 'packages/db/src'

const router: Router = express.Router()

// Public endpoint for frontend users to join waitlist
router.post(
  '/',
  validateRequest(waitlistValidations.createWaitlistSchema),
  waitlistControllers.createWaitlist
)

// Endpoint to view waitlist entries
router.get(
  '/all',
  auth(AuthRoles.ADMIN, AuthRoles.SUPER_ADMIN),
  validateRequest(waitlistValidations.getAllWaitlistSchema),
  waitlistControllers.getAllWaitlist
)

export const waitlistRoutes = router
