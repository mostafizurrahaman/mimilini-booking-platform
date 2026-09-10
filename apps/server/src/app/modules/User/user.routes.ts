import { validateRequest } from '@app/middlewares'
import { auth } from '@app/middlewares/auth'
import express, { Router } from 'express'
import { AuthRoles } from 'packages/db/src'
import { UserValidations } from './user.validations'
import { userControllers } from './user.controllers'
const router: Router = express()

router.get(
  '/all',
  auth(AuthRoles.ADMIN, AuthRoles.SUPER_ADMIN),
  validateRequest(UserValidations.getAllUserSchema),
  userControllers.getAllUsers
)

router.get(
  '/overview',
  auth(AuthRoles.ADMIN, AuthRoles.SUPER_ADMIN),
  validateRequest(UserValidations.getUserOverview),
  userControllers.getOverview
)

router.get(
  '/verifications',
  auth(AuthRoles.ADMIN, AuthRoles.SUPER_ADMIN),
  validateRequest(UserValidations.getAllVerificationsDocs),
  userControllers.getAllVerifications
)

router.get(
  '/:id/details',
  auth(AuthRoles.ADMIN, AuthRoles.SUPER_ADMIN),
  validateRequest(UserValidations.getUserDetailsByID),
  userControllers.getUserDetailsById
)

export const userRoutes = router
