import { catchAsync, sendResponse } from '@repo/shared'
import httpStatus from 'http-status'
import { getUserFromRequest } from '@app/libs'
import { penaltyServices } from './penalty.services'

const getMyPenalties = catchAsync(async (req, res) => {
  const user = await getUserFromRequest(req)
  const result = await penaltyServices.getMyPenalties(user, req.query)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Penalties retrieved successfully!',
    data: {
      penalties: result.penalties,
      hasPendingPenalties: result.hasPendingPenalties,
    },
    meta: result.meta,
  })
})

const getAllPenalties = catchAsync(async (req, res) => {
  const result = await penaltyServices.getAllPenalties(req.query)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'All penalties retrieved successfully!',
    data: result.penalties,
    meta: result.meta,
  })
})

const createPenaltyCheckoutSession = catchAsync(async (req, res) => {
  const user = await getUserFromRequest(req)
  const result = await penaltyServices.createPenaltyCheckoutSession(
    user,
    req.params.id as string
  )

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Stripe checkout session created successfully for penalty payment!',
    data: result,
  })
})

const waivePenalty = catchAsync(async (req, res) => {
  const adminUser = await getUserFromRequest(req)
  const result = await penaltyServices.waivePenalty(
    adminUser,
    req.params.id as string,
    req.body.reason
  )

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: result.message,
    data: result,
  })
})

export const penaltyControllers = {
  getMyPenalties,
  getAllPenalties,
  createPenaltyCheckoutSession,
  waivePenalty,
}
