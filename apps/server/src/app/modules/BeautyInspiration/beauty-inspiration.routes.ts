import express, { Router } from 'express'
import { validateRequest } from '@app/middlewares'
import { beautyInspirationControllers } from './beauty-inspiration.controllers'
import { beautyInspirationValidations } from './beauty-inspiration.validations'
import { multerFactory } from 'packages/media-hub/src'
import { auth } from '@app/middlewares/auth'
import { AuthRoles } from 'packages/db/src'

const router: Router = express.Router()

router.post(
  '/',
  multerFactory({
    category: 'image',
    maxSizeInMB: 10,
  }).single('beautyImage'),
  auth(AuthRoles.ADMIN, AuthRoles.SUPER_ADMIN),
  validateRequest(beautyInspirationValidations.createBeautyInspirationSchema),
  beautyInspirationControllers.createBeautyInspiration
)

router.patch(
  '/:id',
  multerFactory({
    category: 'image',
    maxSizeInMB: 10,
  }).single('image'),
  auth(AuthRoles.ADMIN, AuthRoles.SUPER_ADMIN),
  validateRequest(beautyInspirationValidations.updateBeautyInspirationSchema),
  beautyInspirationControllers.updateBeautyInspiration
)

router.get(
  '/all',
  auth(),
  validateRequest(beautyInspirationValidations.getAllBeautyInspirationSchema),
  beautyInspirationControllers.getAllBeautyInspiration
)

router.get(
  '/:id',
  auth(),
  validateRequest(beautyInspirationValidations.getBeautyInspirationByIdSchema),
  beautyInspirationControllers.getBeautyInspirationById
)

router.delete(
  '/:id',
  auth(AuthRoles.ADMIN, AuthRoles.SUPER_ADMIN),
  validateRequest(beautyInspirationValidations.deleteBeautyInspirationByIdSchema),
  beautyInspirationControllers.deleteBeautyInspirationById
)

export const beautyInspirationRoutes = router
