import express, { Router } from 'express'
import { validateRequest } from '@app/middlewares'
import { contentControllers } from './content.controllers'
import { contentValidations } from './content.validations'
import { AuthRoles } from 'packages/db/src'
import { auth } from '@app/middlewares/auth'

const router: Router = express.Router()

router.patch(
  '/:type',
  auth(AuthRoles.ADMIN, AuthRoles.SUPER_ADMIN),
  validateRequest(contentValidations.updateContentSchema),
  contentControllers.updateContentType
)

router.get(
  '/:type',
  validateRequest(contentValidations.getContentByIdSchema),
  contentControllers.getContentType
)

export const contentRoutes = router
