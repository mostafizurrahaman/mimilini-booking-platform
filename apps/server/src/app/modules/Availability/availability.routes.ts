import express, { Router } from 'express'
import { validateRequest } from '@app/middlewares'
import { availabilityControllers } from './availability.controllers'
import { availabilityValidations } from './availability.validations'

const router : Router = express.Router()

router.post(
  '/',
  validateRequest(availabilityValidations.createAvailabilitySchema),
  availabilityControllers.createAvailability
)

router.patch(
  '/:id',
  validateRequest(availabilityValidations.updateAvailabilitySchema),
  availabilityControllers.updateAvailability
)

router.get(
  '/all',
  validateRequest(availabilityValidations.getAllAvailabilitySchema),
  availabilityControllers.getAllAvailability
)

router.get(
  '/:id',
  validateRequest(availabilityValidations.getAvailabilityByIdSchema),
  availabilityControllers.getAvailabilityById
)

router.delete(
  '/:id',
  validateRequest(availabilityValidations.deleteAvailabilityByIdSchema),
  availabilityControllers.deleteAvailabilityById
)

export const availabilityRoutes = router