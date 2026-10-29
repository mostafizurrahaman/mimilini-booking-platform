import express, { Router } from 'express'
import { auth } from '@app/middlewares/auth'
import { validateRequest } from '@app/middlewares'
import { AuthRoles } from '@repo/db'
import { adminOperationsControllers } from './admin-operations.controllers'
import { adminOperationsValidations } from './admin-operations.validations'

const router: Router = express.Router()

// All routes here are restricted to ADMIN / SUPER_ADMIN
router.use(auth(AuthRoles.ADMIN, AuthRoles.SUPER_ADMIN))

// 1. Dashboard Overview (Figma Admin/1.png)
router.get(
  '/dashboard',
  validateRequest(adminOperationsValidations.getDashboardQuerySchema),
  adminOperationsControllers.getAdminDashboardOverview
)

// 2. Cancellation & Refund Management (Figma Admin/7.png & Admin/8.png)
router.get(
  '/refunds',
  validateRequest(adminOperationsValidations.getRefundsQuerySchema),
  adminOperationsControllers.getAdminRefunds
)

router.get('/refunds/:id', adminOperationsControllers.getAdminRefundDetails)

router.patch(
  '/refunds/:id/action',
  validateRequest(adminOperationsValidations.refundActionSchema),
  adminOperationsControllers.processAdminRefundAction
)

// 3. Financial Management (Figma Admin/9.png)
router.get(
  '/finance/overview',
  validateRequest(adminOperationsValidations.getFinanceOverviewQuerySchema),
  adminOperationsControllers.getAdminFinanceOverview
)

// 4. Reports & Analytics (Figma Admin/13.png)
router.get(
  '/reports/analytics',
  validateRequest(adminOperationsValidations.getReportsAnalyticsQuerySchema),
  adminOperationsControllers.getAdminReportsAnalytics
)

export const adminOperationsRoutes = router

