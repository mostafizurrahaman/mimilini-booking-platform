import express, { Router } from 'express'
import { validateRequest } from '@app/middlewares'
import { artistProfileControllers } from './artist-profile.controllers'
import { artistProfileValidations } from './artist-profile.validations'
import { multerFactory } from 'packages/media-hub/src'
import { auth } from '@app/middlewares/auth'
import { AuthRoles } from 'packages/db/src'

const router : Router = express.Router()

router.post(
  '/',
  multerFactory({
    category: "image", 
    maxSizeInMB: 10
  }).fields([
    {
      name: "drivingLicenseFrontSide", 
      maxCount: 1
    }, 
    { 
      name: "drivingLicenseBackSide", 
      maxCount: 1
    },
    {  
      name: "selfie", 
      maxCount: 1
    }, 
    { 
      name: "profileImage", 
      maxCount: 1
    }
  ]),
  auth(AuthRoles.ARTIST),
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