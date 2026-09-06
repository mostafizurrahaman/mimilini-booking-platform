import express, { Router } from 'express'
import { validateRequest } from '@app/middlewares'
import { bannerControllers } from './banner.controllers'
import { bannerValidations } from './banner.validations'
import { multerFactory } from 'packages/media-hub/src'
import { auth } from '@app/middlewares/auth'
import { AuthRoles } from 'packages/db/src'

const router: Router = express.Router()

router.post(
  '/',

  multerFactory({
    category: 'image',
    maxSizeInMB: 10,
  }).single('bannerImage'),
  auth(AuthRoles.ADMIN, AuthRoles.SUPER_ADMIN),
  validateRequest(bannerValidations.createBannerSchema),
  bannerControllers.createBanner
)

router.patch(
  '/:id',
  validateRequest(bannerValidations.updateBannerSchema),
  bannerControllers.updateBanner
)

router.get(
  '/all',
  validateRequest(bannerValidations.getAllBannerSchema),
  bannerControllers.getAllBanner
)

router.get(
  '/:id',
  validateRequest(bannerValidations.getBannerByIdSchema),
  bannerControllers.getBannerById
)

router.delete(
  '/:id',
  validateRequest(bannerValidations.deleteBannerByIdSchema),
  bannerControllers.deleteBannerById
)

export const bannerRoutes = router
