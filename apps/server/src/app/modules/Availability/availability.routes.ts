import express, { Router } from 'express'
import { validateRequest } from '@app/middlewares'
import { availabilityControllers } from './availability.controllers'
import { availabilityValidations } from './availability.validations'
import { AuthRoles } from 'packages/db/src'
import { auth } from '@app/middlewares/auth'

const router: Router = express.Router()

router.post(
  '/',
  auth(AuthRoles.ARTIST),
  validateRequest(availabilityValidations.createAvailabilitySchema),
  availabilityControllers.createAvailability
)

router.patch(
  '/',
  auth(AuthRoles.ARTIST),
  validateRequest(availabilityValidations.updateAvailabilitySchema),
  availabilityControllers.updateAvailability
)

router.get(
  '/all',
  validateRequest(availabilityValidations.getAllAvailabilitySchema),
  availabilityControllers.getAllAvailability
)

router.get('/', auth(AuthRoles.ARTIST), availabilityControllers.getAvailabilityByUserId)

router.get(
  '/my-calendar',
  auth(AuthRoles.ARTIST),
  availabilityControllers.getMyCalendar
)

router.get(
  '/calendar/:artistId',
  availabilityControllers.getArtistAvailableDaysInMonth
)

router.get(
  '/slots/:artistId',
  availabilityControllers.getArtistAvailableSlotsForDate
)

router.delete(
  '/:id',
  validateRequest(availabilityValidations.deleteAvailabilityByIdSchema),
  availabilityControllers.deleteAvailabilityById
)

export const availabilityRoutes = router
