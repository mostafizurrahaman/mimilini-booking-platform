import express, { Router } from 'express'
import { validateRequest } from '@app/middlewares'
import { beautyPreferencesControllers } from './beauty-preferences.controllers'
import { beautyPreferencesValidations } from './beauty-preferences.validations'
import { AuthRoles } from 'packages/db/src'
import { auth } from '@app/middlewares/auth'

const router: Router = express.Router()

router.post(
  '/',
  auth(AuthRoles.CUSTOMER),
  validateRequest(beautyPreferencesValidations.createBeautyPreferencesSchema),
  beautyPreferencesControllers.createBeautyPreferences
)
router.delete(
  '/',
  auth(AuthRoles.CUSTOMER),
  validateRequest(beautyPreferencesValidations.deleteBeautyPreferencesByIdSchema),
  beautyPreferencesControllers.deleteBeautyPreferencesById
)

export const beautyPreferencesRoutes = router
