import express, { Router } from 'express'
import { validateRequest } from '@app/middlewares'
import { artistBlockedDateControllers } from './artist-blocked-date.controllers'
import { artistBlockedDateValidations } from './artist-blocked-date.validations'
import { auth } from '@app/middlewares/auth'
import { AuthRoles } from '@repo/db'

const router: Router = express.Router()

router.post(
  '/',
  auth(AuthRoles.ARTIST),
  validateRequest(artistBlockedDateValidations.createArtistBlockedDateSchema),
  artistBlockedDateControllers.createArtistBlockedDate
)

router.patch(
  '/:id',
  auth(AuthRoles.ARTIST, AuthRoles.ADMIN, AuthRoles.SUPER_ADMIN),
  validateRequest(artistBlockedDateValidations.updateArtistBlockedDateSchema),
  artistBlockedDateControllers.updateArtistBlockedDate
)

router.get(
  '/all',
  validateRequest(artistBlockedDateValidations.getAllArtistBlockedDateSchema),
  artistBlockedDateControllers.getAllArtistBlockedDate
)

router.get(
  '/',
  auth(AuthRoles.ARTIST),
  validateRequest(artistBlockedDateValidations.getAllArtistBlockedDateSchema),
  artistBlockedDateControllers.getMyArtistBlockedDate
)

router.get(
  '/:id',
  validateRequest(artistBlockedDateValidations.getArtistBlockedDateByIdSchema),
  artistBlockedDateControllers.getArtistBlockedDateById
)

router.delete(
  '/:id',
  auth(AuthRoles.ARTIST, AuthRoles.ADMIN, AuthRoles.SUPER_ADMIN),
  validateRequest(artistBlockedDateValidations.deleteArtistBlockedDateByIdSchema),
  artistBlockedDateControllers.deleteArtistBlockedDateById
)

export const artistBlockedDateRoutes = router
