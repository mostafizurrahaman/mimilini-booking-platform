import httpStatus from 'http-status'
import { catchAsync, sendResponse } from '@repo/shared'
import { adminOperationsServices } from './admin-operations.services'

const getAdminDashboardOverview = catchAsync(async (req, res) => {
  const timeframe = (req.query?.timeframe as any) || 'monthly'
  const result = await adminOperationsServices.getAdminDashboardOverview(timeframe)

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Admin dashboard overview retrieved successfully',
    data: result,
  })
})

const getAdminRefunds = catchAsync(async (req, res) => {
  const result = await adminOperationsServices.getAdminRefunds(req.query as any)

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Refund management list retrieved successfully',
    meta: result.meta,
    data: {
      metrics: result.metrics,
      refunds: result.data,
    },
  })
})

const getAdminRefundDetails = catchAsync(async (req, res) => {
  const { id } = req.params
  const result = await adminOperationsServices.getAdminRefundDetails(id as string)

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Refund details retrieved successfully',
    data: result,
  })
})

const processAdminRefundAction = catchAsync(async (req, res) => {
  const adminUser = req.user
  const { id } = req.params
  const result = await adminOperationsServices.processAdminRefundAction(adminUser, id as string, req.body)

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: `Refund ${req.body.action}ed successfully`,
    data: result,
  })
})

const getAdminFinanceOverview = catchAsync(async (req, res) => {
  const result = await adminOperationsServices.getAdminFinanceOverview(req.query as any)

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Financial management overview retrieved successfully',
    data: result,
  })
})

const getAdminReportsAnalytics = catchAsync(async (req, res) => {
  const result = await adminOperationsServices.getAdminReportsAnalytics(req.query as any)

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Reports and business analytics retrieved successfully',
    data: result,
  })
})

export const adminOperationsControllers = {
  getAdminDashboardOverview,
  getAdminRefunds,
  getAdminRefundDetails,
  processAdminRefundAction,
  getAdminFinanceOverview,
  getAdminReportsAnalytics,
}

