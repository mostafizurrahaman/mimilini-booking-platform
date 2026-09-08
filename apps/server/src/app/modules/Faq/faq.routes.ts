import express, { Router } from 'express'
import { validateRequest } from '@app/middlewares'
import { faqControllers } from './faq.controllers'
import { faqValidations } from './faq.validations'
import { auth } from '@app/middlewares/auth'
import { AuthRoles } from 'packages/db/src'

const router: Router = express.Router()

router.post(
  '/',
  auth(AuthRoles.ADMIN, AuthRoles.SUPER_ADMIN),
  validateRequest(faqValidations.createFaqSchema),
  faqControllers.createFaq
)

router.patch(
  '/:id',
  auth(AuthRoles.ADMIN, AuthRoles.SUPER_ADMIN),
  validateRequest(faqValidations.updateFaqSchema),
  faqControllers.updateFaq
)

router.get('/all', validateRequest(faqValidations.getAllFaqSchema), faqControllers.getAllFaq)

router.get('/:id', validateRequest(faqValidations.getFaqByIdSchema), faqControllers.getFaqById)

router.delete(
  '/:id',
  auth(AuthRoles.ADMIN, AuthRoles.SUPER_ADMIN),
  validateRequest(faqValidations.deleteFaqByIdSchema),
  faqControllers.deleteFaqById
)

export const faqRoutes = router
