import express, { Router } from 'express'
import { validateRequest } from '@app/middlewares'
import { artistProfileControllers } from './artist-profile.controllers'
import { artistProfileValidations } from './artist-profile.validations'

const router : Router = express.Router()

router.post(
  '/',
  validateRequest(artistProfileValidations.createArtistProfileSchema),
  artistProfileControllers.createArtistProfile
)

router.patch(
  '/:id',
  validateRequest(artistProfileValidations.updateArtistProfileSchema),
  artistProfileControllers.updateArtistProfile
)

router.get(
  '/all',
  validateRequest(artistProfileValidations.getAllArtistProfileSchema),
  artistProfileControllers.getAllArtistProfile
)

router.get(
  '/:id',
  validateRequest(artistProfileValidations.getArtistProfileByIdSchema),
  artistProfileControllers.getArtistProfileById
)

router.delete(
  '/:id',
  validateRequest(artistProfileValidations.deleteArtistProfileByIdSchema),
  artistProfileControllers.deleteArtistProfileById
)

export const artistProfileRoutes = router