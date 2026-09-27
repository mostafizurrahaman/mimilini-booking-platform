import express, { Router } from 'express'
import { validateRequest } from '@app/middlewares'
import { addressControllers } from './address.controllers'
import { addressValidations } from './address.validations'
import { auth } from '@app/middlewares/auth'
import { AuthRoles } from '@repo/db'

const router: Router = express.Router()

// Create address (Customer only)
router.post(
  '/',
  auth(AuthRoles.CUSTOMER),
  validateRequest(addressValidations.createAddressSchema),
  addressControllers.createAddress
)

// Get all addresses of logged-in customer
router.get(
  '/',
  auth(AuthRoles.CUSTOMER),
  validateRequest(addressValidations.getAllAddressSchema),
  addressControllers.getMyAddresses
)

// Set an address as default
router.patch(
  '/:id/default',
  auth(AuthRoles.CUSTOMER),
  validateRequest(addressValidations.setDefaultAddressSchema),
  addressControllers.setDefaultAddress
)

// Update address
router.patch(
  '/:id',
  auth(AuthRoles.CUSTOMER),
  validateRequest(addressValidations.updateAddressSchema),
  addressControllers.updateAddress
)

// Get single address
router.get(
  '/:id',
  auth(AuthRoles.CUSTOMER),
  validateRequest(addressValidations.getAddressByIdSchema),
  addressControllers.getAddressById
)

// Delete address
router.delete(
  '/:id',
  auth(AuthRoles.CUSTOMER),
  validateRequest(addressValidations.deleteAddressByIdSchema),
  addressControllers.deleteAddressById
)

export const addressRoutes = router
