import { catchAsync, sendResponse } from '@repo/shared'
import httpStatus from 'http-status'
import { paymentMethodServices } from './payment-method.services'
import { getUserFromRequest } from '@app/libs'

const setupIntent = catchAsync(async (req, res) => {
  const user = await getUserFromRequest(req)
  const result = await paymentMethodServices.setupIntent(user)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Stripe payment intent configured successfully.',
    data: result,
  })
})

const addPaymentMethod = catchAsync(async (req, res) => {
  const user = await getUserFromRequest(req)
  const result = await paymentMethodServices.addPaymentMethod(user, req.body)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.CREATED,
    message: 'Payment method added successfully!',
    data: result,
  })
})

const markAsDefault = catchAsync(async (req, res) => {
  const user = await getUserFromRequest(req)
  const result = await paymentMethodServices.markAsDefault(user, req.params.id as string)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Payment method marked as default successfully!',
    data: result,
  })
})

const getAllPaymentMethod = catchAsync(async (req, res) => {
  const user = await getUserFromRequest(req)
  const result = await paymentMethodServices.getAllPaymentMethod(user, req.query)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Payment methods retrieved successfully!',
    data: result.data,
    meta: result.meta,
  })
})

const getPaymentMethodById = catchAsync(async (req, res) => {
  const user = await getUserFromRequest(req)
  const result = await paymentMethodServices.getPaymentMethodById(user, req.params.id as string)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Payment method retrieved successfully!',
    data: result,
  })
})

const deletePaymentMethodById = catchAsync(async (req, res) => {
  const user = await getUserFromRequest(req)
  const result = await paymentMethodServices.deletePaymentMethodById(user, req.params.id as string)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Payment method deleted successfully!',
    data: result,
  })
})

export const paymentMethodControllers = {
  setupIntent,
  addPaymentMethod,
  markAsDefault,
  getAllPaymentMethod,
  getPaymentMethodById,
  deletePaymentMethodById,
}
