import { Account, accountStatus, ArtistProfile, type IUser } from '@repo/db'
import httpStatus from 'http-status'
import { AppError } from '@repo/shared'

import { createStripeAccount, regenerateConnectedAccountLink, stripe } from '@app/libs/stripe'

// ? 1. Connect Stripe Account :
const connectStripeAccount = async (user: IUser) => {
  if (!user.isProfileCompleted) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Please complete your profile first.')
  }

  // Retrieved the artist profile:
  const artistProfile = await ArtistProfile.findOne({
    user: user?._id,
  })

  if (!artistProfile) {
    throw new AppError(httpStatus.NOT_FOUND, 'Professional profile not found.')
  }

  const existingAccount = await Account.findOne({
    user: user._id,
  })

  if (existingAccount) {
    if (existingAccount.status === accountStatus.ACTIVE) {
      throw new AppError(httpStatus.BAD_REQUEST, 'You already have an active connected account.')
    }

    const url = await regenerateConnectedAccountLink(existingAccount.account)

    return { url }
  }

  const stripeAccount = await createStripeAccount(user, artistProfile)
  const country = (stripeAccount as any).country || 'AU'
  const defaultCurrency = (stripeAccount as any).default_currency || 'aud'

  await Account.create({
    account: stripeAccount.id,
    country,
    currency: defaultCurrency,
    user: user._id,
    detailsSubmitted: false,
    chargesEnabled: false,
    payoutsEnabled: false,
    status: accountStatus.PENDING,
  })

  const url = await regenerateConnectedAccountLink(stripeAccount.id)

  return { url }
}

// ? 2. Connect Get by ID:
const getAccountById = async (user: IUser) => {
  const result = await Account.findOne({
    user: user?._id,
  })

  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, 'Account not found')
  }

  const accountObj = result.toObject()
  let availableBalance = 0
  let pendingBalance = 0

  if (result.account) {
    try {
      const stripeBalance = await stripe.balance.retrieve(
        {},
        { stripeAccount: result.account }
      )
      const audAvailable = stripeBalance.available?.find((b) => b.currency.toLowerCase() === 'aud')
      const audPending = stripeBalance.pending?.find((b) => b.currency.toLowerCase() === 'aud')

      const availCents = audAvailable ? audAvailable.amount : stripeBalance.available?.[0]?.amount || 0
      const pendCents = audPending ? audPending.amount : stripeBalance.pending?.[0]?.amount || 0

      availableBalance = Math.round(((availCents / 100) + Number.EPSILON) * 100) / 100
      pendingBalance = Math.round(((pendCents / 100) + Number.EPSILON) * 100) / 100
    } catch {
      availableBalance = 0
      pendingBalance = 0
    }
  }

  return {
    ...accountObj,
    availableBalance,
    pendingBalance,
  }
}

// ?. Refresh url:
const refreshStripeConnect = async (account: string) => {
  return regenerateConnectedAccountLink(account)
}

export const accountServices = {
  connectStripeAccount,
  getAccountById,
  refreshStripeConnect,
}
