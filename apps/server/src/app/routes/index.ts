import { accountRoutes } from '@app/modules/Account/account.routes'
import { addressRoutes } from '@app/modules/Address/address.routes'
import { artistBlockedDateRoutes } from '@app/modules/ArtistBlockedDate/artist-blocked-date.routes'
import { artistProfileRoutes } from '@app/modules/ArtistProfile/artist-profile.routes'
import { artistServicesRoutes } from '@app/modules/ArtistServices/artist-services.routes'
import { authRoutes } from '@app/modules/Auth/user.routes'
import { availabilityRoutes } from '@app/modules/Availability/availability.routes'
import { bannerRoutes } from '@app/modules/Banner/banner.routes'
import { beautyInspirationRoutes } from '@app/modules/BeautyInspiration/beauty-inspiration.routes'
import { beautyPreferencesRoutes } from '@app/modules/BeautyPreferences/beauty-preferences.routes'
import { categoryRoutes } from '@app/modules/Category/category.routes'
import { contentRoutes } from '@app/modules/Content/content.routes'
import { faqRoutes } from '@app/modules/Faq/faq.routes'
import { platformSettingsRoutes } from '@app/modules/PlatformSettings/platform-settings.routes'
import { promoCodeRoutes } from '@app/modules/PromoCode/promo-code.routes'
import { userRoutes } from '@app/modules/User/user.routes'
import { waitlistRoutes } from '@app/modules/Waitlist/waitlist.routes'
import { paymentMethodRoutes } from '@app/modules/PaymentMethod/payment-method.routes'
import { walletRoutes } from '@app/modules/Wallet/wallet.routes'
import { bookingRoutes } from '@app/modules/Booking/booking.routes'
import { penaltyRoutes } from '@app/modules/Penalty/penalty.routes'
import { chatRoutes } from '@app/modules/Chat/chat.routes'
import { reviewRoutes } from '@app/modules/Review/review.routes'
import { notificationRoutes } from '@app/modules/Notification/notification.routes'
import { adminOperationsRoutes } from '@app/modules/AdminOperations/admin-operations.routes'
import { reportRoutes } from '@app/modules/Report/report.routes'
import { bugReportRoutes } from '@app/modules/BugReport/bug-report.routes'
import express, { Router } from 'express'

const router: Router = express.Router()

const routes = [
  {
    path: '/waitlist',
    route: waitlistRoutes,
  },
  {
    path: '/auth',
    route: authRoutes,
  },
  {
    path: '/artist',
    route: artistProfileRoutes,
  },

  {
    path: '/category',
    route: categoryRoutes,
  },
  {
    path: '/banner',
    route: bannerRoutes,
  },

  {
    path: '/banner-inspiration',
    route: beautyInspirationRoutes,
  },
  {
    path: '/content',
    route: contentRoutes,
  },
  {
    path: '/faq',
    route: faqRoutes,
  },
  {
    path: '/users',
    route: userRoutes,
  },
  {
    path: '/schedules',
    route: availabilityRoutes,
  },
  {
    path: '/blocked-dates',
    route: artistBlockedDateRoutes,
  },
  {
    path: '/services',
    route: artistServicesRoutes,
  },
  {
    path: '/beauty-preferences',
    route: beautyPreferencesRoutes,
  },
  {
    path: '/addresses',
    route: addressRoutes,
  },
  {
    path: '/promo-codes',
    route: promoCodeRoutes,
  },
  {
    path: '/platform-settings',
    route: platformSettingsRoutes,
  },
  {
    path: '/accounts',
    route: accountRoutes,
  },
  {
    path: '/payment-methods',
    route: paymentMethodRoutes,
  },
  {
    path: '/wallets',
    route: walletRoutes,
  },
  {
    path: '/bookings',
    route: bookingRoutes,
  },
  {
    path: '/penalties',
    route: penaltyRoutes,
  },
  {
    path: '/chats',
    route: chatRoutes,
  },
  {
    path: '/reviews',
    route: reviewRoutes,
  },
  {
    path: '/notifications',
    route: notificationRoutes,
  },
  {
    path: '/admin',
    route: adminOperationsRoutes,
  },
  {
    path: '/reports',
    route: reportRoutes,
  },
  {
    path: '/bugs',
    route: bugReportRoutes,
  },
]

routes.forEach((route) => router.use(route.path, route.route))

export const allRoutes = router
