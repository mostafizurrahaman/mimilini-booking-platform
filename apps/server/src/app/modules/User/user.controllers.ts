import { catchAsync, sendResponse } from 'packages/shared/src'
import { userServices } from './user.services'
import httpStatus from 'http-status'
import { getUserFromRequest } from '@app/libs'

// ?? Get all users:
const getAllUsers = catchAsync(async (req, res) => {
  const user = await getUserFromRequest(req)
  const result = await userServices.getAllUsers(user, req.query)

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'All users are retrieved successfully',
    data: result.data,
    meta: result.meta,
  })
})

// ?? Get Overview:
const getOverview = catchAsync(async (req, res) => {
  const result = await userServices.getUserOverview(req.body)
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'The user overview is retrieved successfully.',
    data: result,
  })
})

// ?? Get Verification:
const getAllVerifications = catchAsync(async (req, res) => {
  const user = await getUserFromRequest(req)
  const result = await userServices.getVerificationsDocs(user, req.query)

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'All verification request are retrieved successfully.',
    data: result.data,
    meta: result.meta,
  })
})

// ?? Get user details:
const getUserDetailsById = catchAsync(async (req, res) => {
  const userId = req.params.id
  const result = await userServices.getUserDetailsById(userId as string)

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'User details retrieved successfully.',
    data: result,
  })
})

export const userControllers = {
  getAllUsers,
  getOverview,
  getAllVerifications,
  getUserDetailsById,
}
