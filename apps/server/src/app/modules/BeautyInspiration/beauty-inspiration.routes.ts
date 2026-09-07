import express, { Router } from 'express'
import { validateRequest } from '@app/middlewares'
import { beautyInspirationControllers } from './beauty-inspiration.controllers'
import { beautyInspirationValidations } from './beauty-inspiration.validations'
import { multerFactory } from 'packages/media-hub/src'

const router: Router = express.Router()

router.post(
  '/',
  multerFactory({
    category: 'image',
    maxSizeInMB: 10,
  }).single('image'),
  validateRequest(beautyInspirationValidations.createBeautyInspirationSchema),
  beautyInspirationControllers.createBeautyInspiration
)

router.patch(
  '/:id',
  multerFactory({
    category: 'image',
    maxSizeInMB: 10,
  }).single('image'),
  validateRequest(beautyInspirationValidations.updateBeautyInspirationSchema),
  beautyInspirationControllers.updateBeautyInspiration
)

router.get(
  '/all',
  validateRequest(beautyInspirationValidations.getAllBeautyInspirationSchema),
  beautyInspirationControllers.getAllBeautyInspiration
)

router.get(
  '/:id',
  validateRequest(beautyInspirationValidations.getBeautyInspirationByIdSchema),
  beautyInspirationControllers.getBeautyInspirationById
)

router.delete(
  '/:id',
  validateRequest(beautyInspirationValidations.deleteBeautyInspirationByIdSchema),
  beautyInspirationControllers.deleteBeautyInspirationById
)

export const beautyInspirationRoutes = router
