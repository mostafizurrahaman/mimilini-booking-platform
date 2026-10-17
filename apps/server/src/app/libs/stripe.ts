import configs from '@app/configs'
import {
  Countries,
  Currency,
  type IArtistProfile,
  type IArtistProfileDoc,
  type IUser,
} from '@repo/db'
import Stripe from 'stripe'
import httpStatus from 'http-status'
import { AppError } from '@repo/shared'
import type { Request } from 'express'
import type { Types } from 'mongoose'
import { formatPhoneNumber } from './format-phone'
// ? Stripe configured:
export const stripe = new Stripe(configs.stripe.secretKey, {
  apiVersion: '2026-09-30.endive',
})

// ? Create a new account :
export const createStripeAccount = async (
  user: IUser,
  artistProfile: IArtistProfileDoc,
  metadata?: Record<string, unknown>
) => {
  return stripe.v2.core.accounts.create({
    contact_email: user.email,
    contact_phone: formatPhoneNumber(user.phone!)!,
    dashboard: 'express',
    identity: {
      country: Countries.AUSTRALIA,
      entity_type: 'individual',
      business_details: {
        registered_name: artistProfile.businessName,
        address: {
          country: Countries.AUSTRALIA,
          city: artistProfile.city,
          line1: artistProfile.businessAddress,
          postal_code: artistProfile.postalCode,
          state: artistProfile.state,
        },
        phone: formatPhoneNumber(user.phone!)!,
      },
    },
    display_name: artistProfile.businessName,

    defaults: {
      currency: Currency.AUD,
      responsibilities: {
        fees_collector: 'application',
        losses_collector: 'application',
      },
    },

    configuration: {
      recipient: {
        capabilities: {
          stripe_balance: {
            stripe_transfers: { requested: true },
          },
        },
      },
      merchant: {
        capabilities: {
          card_payments: {
            requested: true,
          },
        },
      },
    },

    metadata: {
      ...(metadata && { ...metadata }),
      email: user.email,
      userId: user?._id?.toString(),
      artistProfileId: artistProfile?._id?.toString() || '',
      abn: artistProfile?.abn || '',
      isGstRegistered: artistProfile?.isGstRegistered ? 'true' : 'false',
    },
  })
}

// ? Regenerate ACCOUNT LINK:
export const regenerateConnectedAccountLink = async (account: string) => {
  const result = await stripe.accountLinks.create({
    account,
    refresh_url: `${configs.stripe.refresh_url}?account=${account}`,
    return_url: configs.stripe.return_url!,
    type: 'account_onboarding',
  })

  return result.url
}

// ? Retrieved the account:
export const retrievedStripeAccount = async (stripeAccountId: string) => {
  const result = await stripe.account.retrieve(stripeAccountId)

  return result
}

// ? Verify webhook:
export const verifyWebHookSignature = (secretKey: string, req: Request): Stripe.Event => {
  if (!secretKey) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Webhook secret is required!')
  }
  const signature = req.headers['stripe-signature'] as string

  const event = stripe.webhooks.constructEvent(req.body, signature, secretKey)

  return event
}

// ?? Create stripe customer:
export const createStripeCustomer = async ({
  name,
  email,
  phone,
}: {
  email: string
  name: string
  phone: string
}) => {
  const customer = await stripe.customers.create({
    name,
    email,
    phone,
  })

  return customer.id
}

// ?? Configure  Payment intent:
export const customerPaymentIntent = async (customerId: string) => {
  const result = await stripe.setupIntents.create({
    customer: customerId,
    automatic_payment_methods: { enabled: true },
    usage: 'off_session',
  })

  return result
}

// ?? Retrieve Payment Method Info:
export const retrievedPaymentMethodAndAttach = async (
  paymentMethodId: string,
  customerId: string
) => {
  const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId)

  if (!paymentMethod || !paymentMethod.card) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Invalid payment method or not a card.')
  }

  // Attach to customer:
  await stripe.paymentMethods.attach(paymentMethod.id, {
    customer: customerId,
  })

  return paymentMethod
}

// ?? Configure Stripe check session :

export const stripeCheckoutSession = async ({
  name,
  unit_amount,
  campaignId,
  campaignCode,
  brandId,
  expiresAt,
  metadata,
}: {
  name: string
  unit_amount: number
  campaignId?: Types.ObjectId
  brandId?: Types.ObjectId
  campaignCode?: string
  expiresAt: number
  metadata: Stripe.MetadataParam
}) => {
  // ?? Success url :
  // const successUrl =
  //  success_url: `${configs.site.clientUrl}&brandId=${brandId}`,
  //   cancel_url: `${configs.site.clientUrl}/payment/cancel?campaignId=${campaignId?.toString()}&campaignCode=${campaignCode}&brandId=${brandId}`,

  const apiSuccessPath = brandId
    ? `/brand-builder/success?session_id={CHECKOUT_SESSION_ID}&brandId=${brandId}`
    : `/payment/success?session_id={CHECKOUT_SESSION_ID}&campaignId=${campaignId?.toString()}&campaignCode=${campaignCode}`
  const apiCancelPath = brandId
    ? `/cancel?session_id={CHECKOUT_SESSION_ID}&brandId=${brandId}`
    : `/payment/cancel?session_id={CHECKOUT_SESSION_ID}&campaignId=${campaignId?.toString()}&campaignCode=${campaignCode}`

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    mode: 'payment',
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: {
            name,
          },

          unit_amount, // $50.00
        },
        quantity: 1,
      },
    ],
    expires_at: expiresAt,
    metadata: {
      ...metadata,
    },
    payment_intent_data: {
      metadata: {
        ...metadata,
      },
    },
    success_url: `${configs.site.clientUrl}${apiSuccessPath}`,
    cancel_url: `${configs.site.clientUrl}${apiCancelPath}`,
  })

  return session
}

export const stripeCheckoutSessionWithApplicationFee = async ({
  name,
  unit_amount,
  application_fee,

  metadata,
  destinationAccountId,
}: {
  name: string
  unit_amount: number
  application_fee: number
  metadata: Stripe.MetadataParam
  destinationAccountId: string
}) => {
  const expiresAtSeconds = Math.floor(Date.now() / 1000) + 30 * 60
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    mode: 'payment',
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: {
            name,
          },

          unit_amount, // $50.00
        },
        quantity: 1,
      },
    ],
    metadata: {
      ...metadata,
    },
    expires_at: expiresAtSeconds,
    payment_intent_data: {
      metadata: {
        ...metadata,
      },
      application_fee_amount: application_fee,
      transfer_data: {
        destination: destinationAccountId,
      },
    },
    success_url: `${configs.site.clientUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${configs.site.clientUrl}/payment/cancel`,
  })

  return session
}

// ?? Create Stripe Payout for connected accounts
export const createStripePayout = async (
  amount: number,
  currency: string,
  stripeAccountId: string,
  metadata: Stripe.MetadataParam,
  idempotencyKey: string
) => {
  return stripe.payouts.create(
    {
      amount: Math.round(amount * 100),
      currency,
      metadata,
    },
    {
      stripeAccount: stripeAccountId,
      idempotencyKey,
    }
  )
}
