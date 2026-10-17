import { logger } from '@app/libs/logger'
import { Account, accountStatus, User, type TAccountStatus } from 'packages/db/src'
import { AppError } from 'packages/shared/src'
import Stripe from 'stripe'
import httpStatus from 'http-status'

// Account Updated Event:
const handleAccountUpdated = async (event: Stripe.Event) => {
  const accountData = event.data.object as Stripe.Account

  // ? Check user id in metadata:
  const userId = accountData?.metadata?.userId
  if (!userId) {
    throw new AppError(httpStatus.NOT_FOUND, 'User is missing in metadata!')
  }

  // ? Retrieve the user with this user id:
  const user = await User.findById(userId)
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found!')
  }

  // ? Extract account information:
  const detailsSubmitted = accountData?.details_submitted ?? false
  const chargesEnabled = accountData.charges_enabled ?? false
  const payoutsEnabled = accountData.payouts_enabled ?? false
  const isAccountActive = detailsSubmitted && chargesEnabled && payoutsEnabled
  const hasRequirements =
    (accountData.requirements?.currently_due?.length ?? 0) > 0 ||
    (accountData.requirements?.past_due?.length ?? 0) > 0
  const disabledReason = accountData.requirements?.disabled_reason || null

  let status: TAccountStatus = accountStatus.PENDING

  if (disabledReason || hasRequirements) {
    status = accountStatus.RESTRICTED
  } else if (isAccountActive) {
    status = accountStatus.ACTIVE
  } else {
    status = accountStatus.PENDING
  }

  await Account.findOneAndUpdate(
    {
      account: accountData?.id,
      user: user?._id,
    },
    {
      $set: {
        status,
        detailsSubmitted,
        payoutsEnabled,
        chargesEnabled,
        disabledReason,
      },
    },
    {
      runValidators: true,
      new: true,
    }
  )

  user.isStripeConnected = status === accountStatus.ACTIVE
  await user.save()
}

// const listenStripeEventsForConnectedAccount = async (event: Stripe.Event) => {
//   switch (event.type) {
//     case 'v2.core.account[requirements].updated':
//       await handleAccountUpdated(event)
//       break
//     case 'account.updated':
//       await handleAccountUpdated(event)
//       break
//     case 'payout.paid':
//       await handlePayoutPaid(event.data.object as Stripe.Payout)
//       break
//     case 'payout.failed':
//       await handlePayoutFailed(event.data.object as Stripe.Payout)
//       break
//     case 'payout.canceled':
//       await handlePayoutCanceled(event.data.object as Stripe.Payout)
//       break
//     default:
//       logger.warn(`Unhandled event type: ${event.type}`)
//   }

//   return { received: true }
// }
const listenStripeEventsForConnectedAccount = async (event: Stripe.Event) => {
  switch (event.type) {
    case 'account.updated':
      await handleAccountUpdated(event)
      break
    // case 'payout.paid':
    //   await handlePayoutPaid(event.data.object as Stripe.Payout)
    //   break
    // case 'payout.failed':
    //   await handlePayoutFailed(event.data.object as Stripe.Payout)
    //   break
    // case 'payout.canceled':
    //   await handlePayoutCanceled(event.data.object as Stripe.Payout)
    //   break
    default:
      logger.warn(`Unhandled event type: ${event.type}`)
  }

  return { received: true }
}

export const stripeServices = {
  listenStripeEventsForConnectedAccount,
  // listenStripeEventsForPlatformAccount,
  // listenStripeEventsForConnectedAccount,
}
