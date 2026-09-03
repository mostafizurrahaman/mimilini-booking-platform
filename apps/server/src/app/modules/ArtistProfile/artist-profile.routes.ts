import express, { Router } from 'express'
import { validateRequest } from '@app/middlewares'
import { artistProfileControllers } from './artist-profile.controllers'
import { artistProfileValidations } from './artist-profile.validations'
import { multerFactory } from 'packages/media-hub/src'
import { auth } from '@app/middlewares/auth'
import { AuthRoles } from 'packages/db/src'

const router: Router = express.Router()

router.post(
  '/',
  multerFactory({
    category: 'image',
    maxSizeInMB: 10,
  }).fields([
    {
      name: 'drivingLicenseFrontSide',
      maxCount: 1,
    },
    {
      name: 'drivingLicenseBackSide',
      maxCount: 1,
    },
    {
      name: 'selfie',
      maxCount: 1,
    },
    {
      name: 'profileImage',
      maxCount: 1,
    },
  ]),
  auth(AuthRoles.ARTIST),
  validateRequest(artistProfileValidations.createArtistProfileSchema),
  artistProfileControllers.createArtistProfile
)

router.patch(
  '/',
  auth(AuthRoles.ARTIST),
  multerFactory({
    category: 'image',
    maxSizeInMB: 10,
  }).single('profileImage'),
  validateRequest(artistProfileValidations.updateArtistProfileSchema),
  artistProfileControllers.updateArtistProfile
)

// ?? Admin route:
router.patch(
  '/verify/:userId',
  auth(AuthRoles.ADMIN, AuthRoles.SUPER_ADMIN),
  validateRequest(artistProfileValidations.verifyArtistDocumentSchema),
  artistProfileControllers.verifyDocument
)

// ?? Admin route:
router.patch(
  '/reject/:userId',
  auth(AuthRoles.ADMIN, AuthRoles.SUPER_ADMIN),
  validateRequest(artistProfileValidations.rejectArtistDocumentSchema),
  artistProfileControllers.rejectDocument
)

// ?? Resubmit Documents:
router.patch(
  '/resubmit',
  multerFactory({
    category: 'image',
    maxSizeInMB: 10,
  }).fields([
    {
      name: 'drivingLicenseFrontSide',
      maxCount: 1,
    },
    {
      name: 'drivingLicenseBackSide',
      maxCount: 1,
    },
    {
      name: 'selfie',
      maxCount: 1,
    },
  ]),
  auth(AuthRoles.ARTIST),
  artistProfileControllers.resubmitDocuments
)

// Verification Status Retrieved:
router.get(
  '/verification-status',
  auth(AuthRoles.ARTIST),
  artistProfileControllers.checkVerificationStatus
)

// ?? Add Portfolio image:
router.patch(
  '/add-portfolio',
  multerFactory({
    category: 'image',
    maxSizeInMB: 10,
  }).array('portfolioImages', 10),
  auth(AuthRoles.ARTIST),
  artistProfileControllers.addNewPortfolioImage
)

router.get(
  '/all',
  validateRequest(artistProfileValidations.getAllArtistProfileSchema),
  artistProfileControllers.getAllArtistProfile
)

export const artistProfileRoutes = router
