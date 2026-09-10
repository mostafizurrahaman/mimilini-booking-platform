import express, { Router } from 'express'
import { validateRequest } from '@app/middlewares'
import { artistBlockedDateControllers } from './artist-blocked-date.controllers'
import { artistBlockedDateValidations } from './artist-blocked-date.validations'

const router : Router = express.Router()

router.post(
  '/',
  validateRequest(artistBlockedDateValidations.createArtistBlockedDateSchema),
  artistBlockedDateControllers.createArtistBlockedDate
)

router.patch(
  '/:id',
  validateRequest(artistBlockedDateValidations.updateArtistBlockedDateSchema),
  artistBlockedDateControllers.updateArtistBlockedDate
)

router.get(
  '/all',
  validateRequest(artistBlockedDateValidations.getAllArtistBlockedDateSchema),
  artistBlockedDateControllers.getAllArtistBlockedDate
)

router.get(
  '/:id',
  validateRequest(artistBlockedDateValidations.getArtistBlockedDateByIdSchema),
  artistBlockedDateControllers.getArtistBlockedDateById
)

router.delete(
  '/:id',
  validateRequest(artistBlockedDateValidations.deleteArtistBlockedDateByIdSchema),
  artistBlockedDateControllers.deleteArtistBlockedDateById
)

export const artistBlockedDateRoutes = router