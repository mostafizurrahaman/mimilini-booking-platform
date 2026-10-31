import httpStatus from 'http-status'
import { catchAsync, sendResponse } from '@repo/shared'
import { reportServices } from './report.services'

const getFullReportsAnalytics = catchAsync(async (req, res) => {
  const result = await reportServices.getFullReportsAnalytics(req.query as any)

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Reports and business intelligence analytics retrieved successfully',
    data: result,
  })
})

const getUserGrowth = catchAsync(async (req, res) => {
  const timeframe = (req.query?.timeframe as any) || 'monthly'
  const year = req.query?.year ? Number(req.query.year) : undefined
  const month = req.query?.month ? Number(req.query.month) : undefined

  const result = await reportServices.getUserGrowth(timeframe, year, month)

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'User growth report retrieved successfully',
    data: result,
  })
})

const getBookingAnalytics = catchAsync(async (req, res) => {
  const months = req.query?.months ? Number(req.query.months) : 6
  const result = await reportServices.getBookingAnalytics(months)

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Booking status analytics retrieved successfully',
    data: result,
  })
})

const getRevenueAnalytics = catchAsync(async (req, res) => {
  const year = req.query?.year ? Number(req.query.year) : undefined
  const result = await reportServices.getRevenueAnalytics(year)

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Revenue and commission analytics retrieved successfully',
    data: result,
  })
})

const getTopArtists = catchAsync(async (req, res) => {
  const result = await reportServices.getTopArtists(req.query as any)

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Top artists leaderboard retrieved successfully',
    data: result,
  })
})

const getCustomerRetention = catchAsync(async (req, res) => {
  const year = req.query?.year ? Number(req.query.year) : undefined
  const result = await reportServices.getCustomerRetention(year)

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Customer retention metrics retrieved successfully',
    data: result,
  })
})

const getPopularServices = catchAsync(async (req, res) => {
  const result = await reportServices.getPopularServices(req.query as any)

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Popular services leaderboard retrieved successfully',
    data: result,
  })
})

const getLocationAnalytics = catchAsync(async (req, res) => {
  const result = await reportServices.getLocationAnalytics(req.query as any)

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Location demand analytics retrieved successfully',
    data: result,
  })
})

const exportReport = catchAsync(async (req, res) => {
  const result = await reportServices.exportReport(req.query as any)

  if (result.format === 'csv') {
    res.setHeader('Content-Type', 'text/csv')
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`)
    return res.status(httpStatus.OK).send(result.data)
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Report export generated successfully',
    data: result.data,
  })
})

export const reportControllers = {
  getFullReportsAnalytics,
  getUserGrowth,
  getBookingAnalytics,
  getRevenueAnalytics,
  getTopArtists,
  getCustomerRetention,
  getPopularServices,
  getLocationAnalytics,
  exportReport,
}

