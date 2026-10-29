import express, { Router } from 'express'
import { auth } from '@app/middlewares/auth'
import { AuthRoles } from '@repo/db'
import { walletControllers } from './wallet.controllers'

const router: Router = express.Router()

router.get(
  '/my-wallet',
  auth(AuthRoles.CUSTOMER, AuthRoles.ARTIST, AuthRoles.ADMIN, AuthRoles.SUPER_ADMIN),
  walletControllers.getMyWallet
)

router.get(
  '/ledger',
  auth(AuthRoles.CUSTOMER, AuthRoles.ARTIST, AuthRoles.ADMIN, AuthRoles.SUPER_ADMIN),
  walletControllers.getMyWalletLedger
)

export const walletRoutes = router
