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

export const userControllers = {
  getAllUsers,
}
