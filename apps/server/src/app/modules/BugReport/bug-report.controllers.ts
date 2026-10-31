import httpStatus from 'http-status'
import { catchAsync, sendResponse } from '@repo/shared'
import { bugReportServices } from './bug-report.services'

const createBugReport = catchAsync(async (req, res) => {
  const user = req.user
  const files = req.files as Express.Multer.File[] | undefined
  const result = await bugReportServices.createBugReport(user, req.body, files)

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'Bug report submitted successfully',
    data: result,
  })
})

const getMyBugReports = catchAsync(async (req, res) => {
  const user = req.user
  const result = await bugReportServices.getMyBugReports(user, req.query as any)

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'My bug reports retrieved successfully',
    meta: result.meta,
    data: result.data,
  })
})

const getAdminBugReports = catchAsync(async (req, res) => {
  const result = await bugReportServices.getAdminBugReports(req.query as any)

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Admin bug reports retrieved successfully',
    meta: result.meta,
    data: {
      metrics: result.metrics,
      bugs: result.data,
    },
  })
})

const getBugReportById = catchAsync(async (req, res) => {
  const user = req.user
  const { id } = req.params
  const result = await bugReportServices.getBugReportById(id as string, user)

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Bug report details retrieved successfully',
    data: result,
  })
})

const updateBugReportStatus = catchAsync(async (req, res) => {
  const adminUser = req.user
  const { id } = req.params
  const result = await bugReportServices.updateBugReportStatus(id as string, adminUser, req.body)

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Bug report status updated successfully',
    data: result,
  })
})

export const bugReportControllers = {
  createBugReport,
  getMyBugReports,
  getAdminBugReports,
  getBugReportById,
  updateBugReportStatus,
}

