import { catchAsync, sendResponse } from '@repo/shared'
import httpStatus from 'http-status'
import { addressServices } from './address.services'
import { getUserFromRequest } from '@app/libs'

// 1. Create Address
const createAddress = catchAsync(async (req, res) => {
  const user = await getUserFromRequest(req)
  const result = await addressServices.createAddress(user, req.body)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.CREATED,
    message: 'Address created successfully!',
    data: result,
  })
})

// 2. Update Address
const updateAddress = catchAsync(async (req, res) => {
  const user = await getUserFromRequest(req)
  const result = await addressServices.updateAddress(user, req.params.id as string, req.body)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Address updated successfully!',
    data: result,
  })
})

// 3. Set Default Address
const setDefaultAddress = catchAsync(async (req, res) => {
  const user = await getUserFromRequest(req)
  const result = await addressServices.setDefaultAddress(user, req.params.id as string)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Address set as default successfully!',
    data: result,
  })
})

// 4. Get My Addresses
const getMyAddresses = catchAsync(async (req, res) => {
  const user = await getUserFromRequest(req)
  const result = await addressServices.getMyAddresses(user, req.query)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Addresses retrieved successfully!',
    data: result.data,
    meta: result.meta,
  })
})

// 5. Get Address By ID
const getAddressById = catchAsync(async (req, res) => {
  const user = await getUserFromRequest(req)
  const result = await addressServices.getAddressById(user, req.params.id as string)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Address retrieved successfully!',
    data: result,
  })
})

// 6. Delete Address
const deleteAddressById = catchAsync(async (req, res) => {
  const user = await getUserFromRequest(req)
  const result = await addressServices.deleteAddressById(user, req.params.id as string)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Address deleted successfully!',
    data: result,
  })
})

export const addressControllers = {
  createAddress,
  updateAddress,
  setDefaultAddress,
  getMyAddresses,
  getAddressById,
  deleteAddressById,
}
