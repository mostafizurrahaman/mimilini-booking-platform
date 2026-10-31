import express, { Router } from 'express'
import { auth } from '@app/middlewares/auth'
import { validateRequest } from '@app/middlewares'
import { AuthRoles } from '@repo/db'
import { reportControllers } from './report.controllers'
import { reportValidations } from './report.validations'

const router: Router = express.Router()

// Restricted to ADMIN / SUPER_ADMIN
router.use(auth(AuthRoles.ADMIN, AuthRoles.SUPER_ADMIN))

// 1. Comprehensive Reports & Analytics (Figma Admin/13.png)
router.get(
  '/',
  validateRequest(reportValidations.getFullReportQuerySchema),
  reportControllers.getFullReportsAnalytics
)

router.get(
  '/analytics',
  validateRequest(reportValidations.getFullReportQuerySchema),
  reportControllers.getFullReportsAnalytics
)

// 2. User Growth Breakdown
router.get(
  '/user-growth',
  validateRequest(reportValidations.getUserGrowthQuerySchema),
  reportControllers.getUserGrowth
)

// 3. Booking Analytics & Status Breakdown
router.get(
  '/booking-analytics',
  validateRequest(reportValidations.getBookingAnalyticsQuerySchema),
  reportControllers.getBookingAnalytics
)

// 4. Revenue, Commission & Net Profit Analytics
router.get(
  '/revenue-analytics',
  validateRequest(reportValidations.getRevenueAnalyticsQuerySchema),
  reportControllers.getRevenueAnalytics
)

// 5. Top Performing Artists
router.get(
  '/top-artists',
  validateRequest(reportValidations.getTopArtistsQuerySchema),
  reportControllers.getTopArtists
)

// 6. Customer Retention & Repeat Bookings
router.get('/customer-retention', reportControllers.getCustomerRetention)

// 7. Popular Services Leaderboard (Supports "See All" with pagination)
router.get(
  '/popular-services',
  validateRequest(reportValidations.getPopularServicesQuerySchema),
  reportControllers.getPopularServices
)

// 8. Location Demand Analytics
router.get('/location-analytics', reportControllers.getLocationAnalytics)

// 9. Export Report (CSV / JSON)
router.get(
  '/export',
  validateRequest(reportValidations.exportReportQuerySchema),
  reportControllers.exportReport
)

export const reportRoutes = router

