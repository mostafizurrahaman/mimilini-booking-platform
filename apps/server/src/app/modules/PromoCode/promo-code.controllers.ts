import { catchAsync, sendResponse } from '@repo/shared'
import httpStatus from 'http-status'
import { promoCodeServices } from './promo-code.services'

const createPromoCode = catchAsync(async (req, res) => {
  const result = await promoCodeServices.createPromoCode(req.body)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.CREATED,
    message: 'The promo code created successfully!',
    data: result,
  })
})

const updatePromoCode = catchAsync(async (req, res) => {
  const result = await promoCodeServices.updatePromoCode(req.params.id as string, req.body)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'The promo code updated successfully!',
    data: result,
  })
})

const getAllPromoCode = catchAsync(async (req, res) => {
  const result = await promoCodeServices.getAllPromoCode(req.query)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'The promo code retrieved successfully!',
    data: result.data,
    meta: result.meta,
  })
})

const getPromoCodeById = catchAsync(async (req, res) => {
  const result = await promoCodeServices.getPromoCodeById(req.params.id as string)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'The promo code retrieved successfully!',
    data: result,
  })
})

const deletePromoCodeById = catchAsync(async (req, res) => {
  const result = await promoCodeServices.deletePromoCodeById(req.params.id as string)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'The promo code deleted successfully!',
    data: result,
  })
})

export const promoCodeControllers = {
  createPromoCode,
  updatePromoCode,
  getAllPromoCode,
  getPromoCodeById,
  deletePromoCodeById
}