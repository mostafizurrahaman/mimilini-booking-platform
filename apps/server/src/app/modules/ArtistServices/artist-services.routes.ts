import express, { Router } from 'express'
import { validateRequest } from '@app/middlewares'
import { artistServicesControllers } from './artist-services.controllers'
import { artistServicesValidations } from './artist-services.validations'
import { AuthRoles } from 'packages/db/src'
import { auth } from '@app/middlewares/auth'

const router: Router = express.Router()

router.post(
  '/',
  auth(AuthRoles.ARTIST),
  validateRequest(artistServicesValidations.createArtistServicesSchema),
  artistServicesControllers.createArtistServices
)

router.patch(
  '/:id',
  auth(AuthRoles.ARTIST),
  validateRequest(artistServicesValidations.updateArtistServicesSchema),
  artistServicesControllers.updateArtistServices
)

router.patch(
  '/:id/toggle-featured',
  auth(AuthRoles.ARTIST),
  validateRequest(artistServicesValidations.toggleArtistServicesFeaturedSchema),
  artistServicesControllers.toggleFeatured
)
router.patch(
  '/:id/toggle-popular',
  auth(AuthRoles.ARTIST),
  validateRequest(artistServicesValidations.toggleArtistServicesPopularSchema),
  artistServicesControllers.togglePopular
)

router.get(
  '/all',
  auth(),
  validateRequest(artistServicesValidations.getAllArtistServicesSchema),
  artistServicesControllers.getAllArtistServices
)

router.get(
  '/active',
  auth(),
  validateRequest(artistServicesValidations.getAllArtistServicesSchema),
  artistServicesControllers.getAllActiveArtistServices
)

router.get(
  '/my',
  auth(AuthRoles.ARTIST),
  validateRequest(artistServicesValidations.getMyAllServicesSchema),
  artistServicesControllers.getMyArtistServices
)

router.get(
  '/:id',
  auth(),
  validateRequest(artistServicesValidations.getArtistServicesByIdSchema),
  artistServicesControllers.getArtistServicesById
)

router.delete(
  '/:id',
  auth(AuthRoles.ARTIST),
  validateRequest(artistServicesValidations.deleteArtistServicesByIdSchema),
  artistServicesControllers.deleteArtistServicesById
)

export const artistServicesRoutes = router
