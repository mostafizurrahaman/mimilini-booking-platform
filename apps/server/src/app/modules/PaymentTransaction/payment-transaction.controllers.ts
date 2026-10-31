import { catchAsync, sendResponse } from '@repo/shared'
import httpStatus from 'http-status'
import { getUserFromRequest } from '@app/libs'
import { paymentTransactionServices } from './payment-transaction.services'

const getCustomerTransactions = catchAsync(async (req, res) => {
  const user = await getUserFromRequest(req)
  const result = await paymentTransactionServices.getCustomerTransactions(user._id, req.query)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Customer payment transactions retrieved successfully!',
    data: {
      transactions: result.transactions,
      summary: result.summary,
    },
    meta: result.meta,
  })
})

const getArtistTransactions = catchAsync(async (req, res) => {
  const user = await getUserFromRequest(req)
  const result = await paymentTransactionServices.getArtistTransactions(user._id, req.query)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Artist earnings and payout transactions retrieved successfully!',
    data: {
      transactions: result.transactions,
      summary: result.summary,
    },
    meta: result.meta,
  })
})

const getMyTransactions = catchAsync(async (req, res) => {
  const user = await getUserFromRequest(req)
  const isArtist = user.role === 'artist'

  const result = isArtist
    ? await paymentTransactionServices.getArtistTransactions(user._id, req.query)
    : await paymentTransactionServices.getCustomerTransactions(user._id, req.query)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: isArtist
      ? 'Artist earnings and payout transactions retrieved successfully!'
      : 'Customer payment transactions retrieved successfully!',
    data: {
      transactions: result.transactions,
      summary: result.summary,
    },
    meta: result.meta,
  })
})

export const paymentTransactionControllers = {
  getCustomerTransactions,
  getArtistTransactions,
  getMyTransactions,
}

