import { catchAsync, sendResponse } from '@repo/shared'
import httpStatus from 'http-status'
import { promoCodeServices } from './promo-code.services'
import { getUserFromRequest } from '@app/libs'

const createPromoCode = catchAsync(async (req, res) => {
  const user = await getUserFromRequest(req)
  const result = await promoCodeServices.createPromoCode(user, req.body)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.CREATED,
    message: 'Promo code created successfully!',
    data: result,
  })
})

const updatePromoCode = catchAsync(async (req, res) => {
  const user = await getUserFromRequest(req)
  const result = await promoCodeServices.updatePromoCode(
    user,
    req.params.id as string,
    req.body
  )

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Promo code updated successfully!',
    data: result,
  })
})

const updatePromoCodeStatus = catchAsync(async (req, res) => {
  const user = await getUserFromRequest(req)
  const result = await promoCodeServices.updatePromoCodeStatus(
    user,
    req.params.id as string,
    req.body
  )

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Promo code status updated successfully!',
    data: result,
  })
})

const getAllPromoCode = catchAsync(async (req, res) => {
  const result = await promoCodeServices.getAllPromoCode(req.query)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Promo codes retrieved successfully!',
    data: result.data,
    meta: result.meta,
  })
})

const getMyPromoCodes = catchAsync(async (req, res) => {
  const user = await getUserFromRequest(req)
  const result = await promoCodeServices.getMyPromoCodes(user, req.query)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Your promo codes retrieved successfully!',
    data: {
      promoCodes: result.data,
      stats: result.stats,
    },
    meta: result.meta,
  })
})

const getPromoCodeById = catchAsync(async (req, res) => {
  const user = await getUserFromRequest(req)
  const result = await promoCodeServices.getPromoCodeById(
    user,
    req.params.id as string
  )

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Promo code retrieved successfully!',
    data: result,
  })
})

const deletePromoCodeById = catchAsync(async (req, res) => {
  const user = await getUserFromRequest(req)
  const result = await promoCodeServices.deletePromoCodeById(
    user,
    req.params.id as string
  )

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Promo code deleted successfully!',
    data: result,
  })
})

const validatePromoCode = catchAsync(async (req, res) => {
  const result = await promoCodeServices.validatePromoCode(req.body)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Promo code validated successfully!',
    data: result,
  })
})

export const promoCodeControllers = {
  createPromoCode,
  updatePromoCode,
  updatePromoCodeStatus,
  getAllPromoCode,
  getMyPromoCodes,
  getPromoCodeById,
  deletePromoCodeById,
  validatePromoCode,
}
