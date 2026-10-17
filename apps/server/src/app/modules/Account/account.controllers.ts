import { catchAsync, sendResponse } from '@repo/shared'
import httpStatus from 'http-status'
import { accountServices } from './account.services'
import { getUserFromRequest } from '@app/libs/get-user-from-request'

const connectStripeAccount = catchAsync(async (req, res) => {
  const user = await getUserFromRequest(req)
  const result = await accountServices.connectStripeAccount(user)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.CREATED,
    message: 'The account created successfully!',
    data: result,
  })
})

const getAccountById = catchAsync(async (req, res) => {
  const user = await getUserFromRequest(req)
  const result = await accountServices.getAccountById(user)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'The account retrieved successfully!',
    data: result,
  })
})
const refreshAccount = catchAsync(async (req, res) => {
  const url = await accountServices.refreshStripeConnect(req.query.account as string)

  res.redirect(url)
})

export const accountControllers = {
  connectStripeAccount,
  getAccountById,
  refreshAccount,
}
