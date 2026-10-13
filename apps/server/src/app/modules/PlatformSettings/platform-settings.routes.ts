import express, { Router } from 'express'
import { validateRequest } from '@app/middlewares'
import { platformSettingsControllers } from './platform-settings.controllers'
import { platformSettingsValidations } from './platform-settings.validations'
import { auth } from '@app/middlewares/auth'
import { AuthRoles } from '@repo/db'

const router: Router = express.Router()

// 1. Get global platform settings (Admin & Super Admin only)
router.get(
  '/',
  auth(AuthRoles.ADMIN, AuthRoles.SUPER_ADMIN),
  platformSettingsControllers.getPlatformSettings
)

// 2. Update global platform settings (Admin & Super Admin only)
router.patch(
  '/',
  auth(AuthRoles.ADMIN, AuthRoles.SUPER_ADMIN),
  validateRequest(platformSettingsValidations.updatePlatformSettingsSchema),
  platformSettingsControllers.updatePlatformSettings
)

// 3. Create or upsert global platform settings (Admin & Super Admin only)
router.post(
  '/',
  auth(AuthRoles.ADMIN, AuthRoles.SUPER_ADMIN),
  validateRequest(platformSettingsValidations.createPlatformSettingsSchema),
  platformSettingsControllers.createPlatformSettings
)

export const platformSettingsRoutes = router