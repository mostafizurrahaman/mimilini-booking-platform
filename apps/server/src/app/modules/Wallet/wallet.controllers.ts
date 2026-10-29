import { catchAsync, sendResponse } from '@repo/shared'
import httpStatus from 'http-status'
import { getUserFromRequest } from '@app/libs'
import { walletServices } from './wallet.services'

const getMyWallet = catchAsync(async (req, res) => {
  const user = await getUserFromRequest(req)
  const result = await walletServices.getMyWallet(user._id)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Wallet balance retrieved successfully!',
    data: result,
  })
})

const getMyWalletLedger = catchAsync(async (req, res) => {
  const user = await getUserFromRequest(req)
  const result = await walletServices.getMyWalletLedger(user._id, req.query)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Wallet ledger history retrieved successfully!',
    data: result.transactions,
    meta: result.meta,
  })
})

export const walletControllers = {
  getMyWallet,
  getMyWalletLedger,
}
