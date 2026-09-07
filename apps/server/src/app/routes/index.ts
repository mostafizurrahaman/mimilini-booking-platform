import { artistProfileRoutes } from '@app/modules/ArtistProfile/artist-profile.routes'
import { authRoutes } from '@app/modules/Auth/user.routes'
import { bannerRoutes } from '@app/modules/Banner/banner.routes'
import { beautyInspirationRoutes } from '@app/modules/BeautyInspiration/beauty-inspiration.routes'
import { categoryRoutes } from '@app/modules/Category/category.routes'
import express, { Router } from 'express'

const router: Router = express.Router()

const routes = [
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
]

routes.forEach((route) => router.use(route.path, route.route))

export const allRoutes = router
