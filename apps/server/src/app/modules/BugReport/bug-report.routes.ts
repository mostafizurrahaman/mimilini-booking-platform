import express, { Router } from 'express'
import { auth } from '@app/middlewares/auth'
import { validateRequest } from '@app/middlewares'
import { AuthRoles } from '@repo/db'
import { multerFactory } from 'packages/media-hub/src'
import { bugReportControllers } from './bug-report.controllers'
import { bugReportValidations } from './bug-report.validations'

const router: Router = express.Router()

const bugAttachmentsUpload = multerFactory({
  category: 'image',
  maxSizeInMB: 10,
}).array('attachments', 5)

// 1. Customer / User: Submit a bug report (supports optional screenshot attachments)
router.post(
  '/',
  auth(AuthRoles.CUSTOMER, AuthRoles.ARTIST, AuthRoles.ADMIN, AuthRoles.SUPER_ADMIN),
  bugAttachmentsUpload,
  validateRequest(bugReportValidations.createBugReportSchema),
  bugReportControllers.createBugReport
)

router.post(
  '/report',
  auth(AuthRoles.CUSTOMER, AuthRoles.ARTIST, AuthRoles.ADMIN, AuthRoles.SUPER_ADMIN),
  bugAttachmentsUpload,
  validateRequest(bugReportValidations.createBugReportSchema),
  bugReportControllers.createBugReport
)

// 2. Customer / User: Get my reported bugs
router.get(
  '/my-reports',
  auth(AuthRoles.CUSTOMER, AuthRoles.ARTIST, AuthRoles.ADMIN, AuthRoles.SUPER_ADMIN),
  bugReportControllers.getMyBugReports
)

// 3. Admin: Get all reported bugs with status filter, search, and metrics
router.get(
  '/admin',
  auth(AuthRoles.ADMIN, AuthRoles.SUPER_ADMIN),
  validateRequest(bugReportValidations.getBugReportsQuerySchema),
  bugReportControllers.getAdminBugReports
)

router.get(
  '/',
  auth(AuthRoles.ADMIN, AuthRoles.SUPER_ADMIN),
  validateRequest(bugReportValidations.getBugReportsQuerySchema),
  bugReportControllers.getAdminBugReports
)

// 4. Get a single bug report by ID (Customer can view their own, Admin can view any)
router.get(
  '/:id',
  auth(AuthRoles.CUSTOMER, AuthRoles.ARTIST, AuthRoles.ADMIN, AuthRoles.SUPER_ADMIN),
  bugReportControllers.getBugReportById
)

// 5. Admin: Update bug report status and resolution note
router.patch(
  '/:id/status',
  auth(AuthRoles.ADMIN, AuthRoles.SUPER_ADMIN),
  validateRequest(bugReportValidations.updateBugStatusSchema),
  bugReportControllers.updateBugReportStatus
)

router.patch(
  '/:id',
  auth(AuthRoles.ADMIN, AuthRoles.SUPER_ADMIN),
  validateRequest(bugReportValidations.updateBugStatusSchema),
  bugReportControllers.updateBugReportStatus
)

export const bugReportRoutes = router

