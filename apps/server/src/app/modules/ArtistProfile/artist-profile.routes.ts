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

// ?? Remove Portfolio image:
router.patch(
  '/remove-portfolio',
  auth(AuthRoles.ARTIST),
  validateRequest(artistProfileValidations.removePortfolioSchema),
  artistProfileControllers.removePortfolioImage
)

router.delete(
  '/remove-portfolio',
  auth(AuthRoles.ARTIST),
  validateRequest(artistProfileValidations.removePortfolioSchema),
  artistProfileControllers.removePortfolioImage
)

// ?? Add Certification (one by one):
router.patch(
  '/add-certification',
  auth(AuthRoles.ARTIST),
  multerFactory({
    category: 'image',
    maxSizeInMB: 10,
  }).single('certificate'),
  validateRequest(artistProfileValidations.addCertificationSchema),
  artistProfileControllers.addCertification
)

// ?? Remove Certification (one by one):
router.delete(
  '/remove-certification', 
  auth(AuthRoles.ARTIST),
  validateRequest(artistProfileValidations.removeCertificationSchema),
  artistProfileControllers.removeCertification
)

router.get(
  '/find',
  validateRequest(artistProfileValidations.findAvailableArtistsSchema),
  artistProfileControllers.findAvailableArtists
)

router.get(
  '/all',
  validateRequest(artistProfileValidations.getAllArtistProfileSchema),
  artistProfileControllers.getAllArtistProfile
)

// Favorite Artists (Customer Wishlist):
router.get(
  '/favorites/my',
  auth(AuthRoles.CUSTOMER),
  artistProfileControllers.getMyFavoriteArtists
)

router.post(
  '/favorites/:artistId',
  auth(AuthRoles.CUSTOMER),
  validateRequest(artistProfileValidations.toggleFavoriteArtistSchema),
  artistProfileControllers.toggleFavoriteArtist
)

// ?? Get Single Artist Profile View (Screen 15.png):
router.get(
  '/:artistId',
  validateRequest(artistProfileValidations.getArtistDetailsSchema),
  artistProfileControllers.getArtistDetails
)

export const artistProfileRoutes = router
