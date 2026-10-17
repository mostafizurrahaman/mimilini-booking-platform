import express, { Router } from 'express'
import { accountControllers } from './account.controllers'
import { AuthRoles } from 'packages/db/src'
import { auth } from '@app/middlewares/auth'

const router: Router = express.Router()

router.post('/connect', auth(AuthRoles.ARTIST), accountControllers.connectStripeAccount)

router.get('/', auth(AuthRoles.ARTIST), accountControllers.getAccountById)
router.get('/refresh', accountControllers.refreshAccount)
export const accountRoutes = router
