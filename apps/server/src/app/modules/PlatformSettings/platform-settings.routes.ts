import express, { Router } from 'express'
import { validateRequest } from '@app/middlewares'
import { platformSettingsControllers } from './platform-settings.controllers'
import { platformSettingsValidations } from './platform-settings.validations'
import { auth } from '@app/middlewares/auth'
import { AuthRoles } from '@repo/db'

const router: Router = express.Router()

// 1. Create platform settings (Admin & Super Admin only)
router.post(
  '/',
  auth(AuthRoles.ADMIN, AuthRoles.SUPER_ADMIN),
  validateRequest(platformSettingsValidations.createPlatformSettingsSchema),
  platformSettingsControllers.createPlatformSettings
)

// 2. Update platform settings (Admin & Super Admin only)
router.patch(
  '/:id',
  auth(AuthRoles.ADMIN, AuthRoles.SUPER_ADMIN),
  validateRequest(platformSettingsValidations.updatePlatformSettingsSchema),
  platformSettingsControllers.updatePlatformSettings
)

router.patch(
  '/',
  auth(AuthRoles.ADMIN, AuthRoles.SUPER_ADMIN),
  validateRequest(platformSettingsValidations.updatePlatformSettingsSchema),
  platformSettingsControllers.updatePlatformSettings
)

// 3. Get platform settings (Admin & Super Admin only)
router.get(
  '/:id',
  auth(AuthRoles.ADMIN, AuthRoles.SUPER_ADMIN),
  validateRequest(platformSettingsValidations.getPlatformSettingsSchema),
  platformSettingsControllers.getPlatformSettings
)

router.get(
  '/',
  auth(AuthRoles.ADMIN, AuthRoles.SUPER_ADMIN),
  validateRequest(platformSettingsValidations.getPlatformSettingsSchema),
  platformSettingsControllers.getPlatformSettings
)

export const platformSettingsRoutes = router