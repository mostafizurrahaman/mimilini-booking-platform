import { stripe } from '@app/libs/stripe'
import httpStatus from 'http-status'
import moment from 'moment'
import mongoose from 'mongoose'
import {
  BrandBuilder,
  BrandBuilderPayment,
  brandBuilderStatus,
  Campaign,
  campaignLunchPaymentStatus,
  CampaignStatus,
  Donation,
  DonationPayment,
  DonationStatus,
  Order,
  OrderItem,
  OrderPayment,
  OrderStatus,
  Payment,
  PaymentBreakDown,
  paymentStatus,
  paymentType,
  Payout,
  PayoutPayment,
  PayoutStatus,
  PhysicalProduct,
  productType,
  PromoCode,
  PromoCodeUsage,
  User,
  type TPaymentType,
} from '@repo/db'
import { AppError } from '@repo/shared'
import type Stripe from 'stripe'
import configs from '@app/configs'
import { sendEmail } from 'packages/email-sender/src'
import { CampaignLiveEmail, renderEmail } from 'packages/email-templates/src'
import { sendCampaignLiveNotification } from '../Campaign/campaign.utils'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

interface TCampaignPaymentMetaData {
  organizerId: string
  campaignId: string
  paymentType: TPaymentType
  payableAmount?: number
  discountAmount?: number
  originalAmount?: number
}

interface TDonationPaymentMetaData {
  organizer: string
  campaign: string
  donation: string
  supporter: string
  paymentType: TPaymentType
  grossAmount: number // Customer pays this
  stripeFee: number
  platformFee: number
  organizerNetAmount: number
}

interface TOrderPaymentMetaData {
  organizer: string
  campaign: string
  order: string
  supporter: string
  paymentType: TPaymentType
  grossAmount: number // Customer pays this
  stripeFee: number
  platformFee: number
  shippingFee: number
  organizerNetAmount: number
}

interface IBrandBuilderMeta {
  brandBuilderFee: number
  organizerId: string
  brandBuilderId: string
}

export const handleCampaignCheckoutPaymentSuccess = async (session: Stripe.Checkout.Session) => {
  if (session.payment_status !== 'paid') {
    throw new AppError(httpStatus.BAD_REQUEST, 'Payment not paid yet.')
  }
  const { metadata } = session

  const { campaignId, organizerId, discountAmount, payableAmount, originalAmount } =
    metadata as unknown as TCampaignPaymentMetaData

  const paymentIntentId = session.payment_intent
  const sessionId = session.id

  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId as string)

  let charge = await stripe.charges.retrieve(paymentIntent.latest_charge as string)

  let retry = 5

  while (!charge.balance_transaction && retry > 0) {
    //console.log("Waiting for balance transaction...");

    await sleep(1000)

    charge = await stripe.charges.retrieve(charge.id)

    retry--
  }

  if (!charge.balance_transaction) {
    throw new AppError(httpStatus.NOT_FOUND, 'Balance transaction is not available yet.')
  }

  const balanceTx = await stripe.balanceTransactions.retrieve(charge.balance_transaction as string)

  const stripeOriginalAmount = balanceTx.net / 100
  const stripeFee = balanceTx.fee / 100

  //  ??  Check any campaign exists with this id and organization
  const campaign = await Campaign.findOne({
    _id: campaignId,
    organizer: organizerId,
    status: { $in: [CampaignStatus.DRAFT, CampaignStatus.PENDING] },
  })

  const durationDays = campaign?.durationDays ?? 1
  const startDate = moment().toDate()
  const endDate = moment().add(durationDays, 'days').toDate()
  const publishedAt = moment().toDate()

  if (campaign) {
    const session = await mongoose.startSession()

    try {
      session.startTransaction()
      const updateCampaign = await Campaign.findOneAndUpdate(
        {
          _id: campaign?._id,
        },
        {
          $set: {
            finalLaunchFee: stripeOriginalAmount,
            status: CampaignStatus.ACTIVE,
            paymentStatus: paymentStatus.PAID,
            startDate,
            endDate,
            publishedAt,
          },
        },
        {
          new: true,
          runValidators: true,
          session,
        }
      )

      if (updateCampaign?.promoCode) {
        await PromoCodeUsage.findOneAndUpdate(
          {
            user: organizerId,
            promoCode: updateCampaign?.promoCode,
            campaign: updateCampaign?._id,
          },
          {
            $set: {
              usedAt: new Date(),
            },
          },
          {
            session,
          }
        )
      }

      const payment = await Payment.findOneAndUpdate(
        {
          campaign: campaign?._id,
          organizer: organizerId,
          paymentType: paymentType.LAUNCH_FEE,
          status: paymentStatus.PENDING,
        },
        {
          $set: {
            status: paymentStatus.PAID,
            stripeCheckoutSessionId: sessionId,
            stripePaymentIntentId: paymentIntent.id,
            stripeBalanceTransactionId: balanceTx.id,
            stripeChargeId: charge.id,
            paidAt: new Date(),
          },
        },
        {
          returnDocument: 'after',
          sort: { createdAt: -1 },
          session,
        }
      )

      if (!payment) {
        throw new AppError(httpStatus.BAD_REQUEST, 'Payment not found!')
      }

      await PaymentBreakDown.create(
        [
          {
            payment: payment?._id,
            subtotal: originalAmount as number,
            totalAmount: stripeOriginalAmount as number,
            stripeFee: stripeFee as number,
            discountAmount: discountAmount as number,
          },
        ],
        { session }
      )

      await session.commitTransaction()

      const organizer = await User.findById(campaign?.organizer)

      if (organizer && campaign) {
        await sendCampaignLiveNotification(campaign, organizer)
      }
    } catch (error) {
      await session.abortTransaction()
      console.log(error)
    } finally {
      await session.endSession()
    }
  }
}

export const handleBrandBuilderCheckoutPaymentSuccess = async (
  session: Stripe.Checkout.Session
) => {
  if (session.payment_status !== 'paid') {
    throw new AppError(httpStatus.BAD_REQUEST, 'Payment not paid yet.')
  }

  console.log(session)
  const { metadata } = session

  const { brandBuilderId } = metadata as unknown as IBrandBuilderMeta

  const paymentIntentId = session.payment_intent
  const sessionId = session.id

  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId as string)

  let charge = await stripe.charges.retrieve(paymentIntent.latest_charge as string)

  let retry = 5

  while (!charge.balance_transaction && retry > 0) {
    //console.log("Waiting for balance transaction...");

    await sleep(1000)

    charge = await stripe.charges.retrieve(charge.id)

    retry--
  }

  if (!charge.balance_transaction) {
    throw new AppError(httpStatus.NOT_FOUND, 'Balance transaction is not available yet.')
  }

  const balanceTx = await stripe.balanceTransactions.retrieve(charge.balance_transaction as string)

  const amount = balanceTx.amount / 100
  const stripeOriginalAmount = balanceTx.net / 100
  const stripeFee = balanceTx.fee / 100

  const mongoSession = await mongoose.startSession()

  try {
    mongoSession.startTransaction()

    // Prevent duplicate webhook processing
    const existingPayment = await BrandBuilderPayment.findOne({
      stripeCheckoutSessionId: sessionId,
      status: paymentStatus.PAID,
    }).session(mongoSession)

    if (existingPayment) {
      await mongoSession.commitTransaction()
      return existingPayment
    }

    const payment = await BrandBuilderPayment.findOneAndUpdate(
      {
        stripeCheckoutSessionId: sessionId,
        status: {
          $ne: paymentStatus.PAID,
        },
      },
      {
        $set: {
          status: paymentStatus.PAID,
          amount: amount,
          stripePaymentIntentId: paymentIntentId,
          stripeChargeId: charge.id,
          stripeBalanceTransactionId: balanceTx.id,
          paidAt: new Date(),
        },
      },
      {
        sort: {
          createdAt: -1,
        },
        new: true,
        session: mongoSession,
      }
    )

    if (!payment) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Payment not found.')
    }

    const paymentBreakdownExists = await PaymentBreakDown.findOne({
      payment: payment._id,
    }).session(mongoSession)

    if (!paymentBreakdownExists) {
      await PaymentBreakDown.create(
        [
          {
            payment: payment._id,
            subtotal: amount,
            totalAmount: stripeOriginalAmount,
            stripeFee,
          },
        ],
        {
          session: mongoSession,
        }
      )
    }

    await BrandBuilder.findOneAndUpdate(
      {
        _id: brandBuilderId,
      },
      {
        $set: {
          paidAmount: amount,
          status: brandBuilderStatus.PAID,
          paidAt: new Date(),
        },
      },
      {
        session: mongoSession,
      }
    )

    await mongoSession.commitTransaction()
  } catch (error) {
    await mongoSession.abortTransaction()
    console.log(error)
  } finally {
    await mongoSession.endSession()
  }
}

export const handleCampaignCheckoutSessionExpired = async (
  checkoutSession: Stripe.Checkout.Session
) => {
  const metadata = checkoutSession.metadata as unknown as TCampaignPaymentMetaData

  if (!metadata) return

  const { campaignId, organizerId } = metadata

  const session = await mongoose.startSession()

  try {
    session.startTransaction()

    const payment = await Payment.findOne({
      campaign: campaignId,
      organizer: organizerId,
      paymentType: paymentType.LAUNCH_FEE,
      status: paymentStatus.PENDING,
    })
      .sort({ createdAt: -1 })
      .session(session)

    // Already processed or doesn't exist
    if (!payment || payment.status !== paymentStatus.PENDING) {
      await session.commitTransaction()
      return
    }

    const campaign = await Campaign.findOne({
      _id: campaignId,
      organizer: organizerId,
    }).session(session)

    if (!campaign) {
      throw new AppError(httpStatus.NOT_FOUND, 'Campaign not found.')
    }

    /**
     * Rollback promo reservation
     */
    if (campaign.promoCode) {
      await PromoCode.findByIdAndUpdate(
        campaign.promoCode,
        { $set: { usedCount: { $max: [{ $subtract: ['$usedCount', 1] }, 0] } } },
        { session }
      )

      await PromoCodeUsage.findOneAndDelete(
        {
          campaign: campaign._id,
          user: organizerId,
          promoCode: campaign.promoCode,
        },
        { session }
      )
    }

    /**
     * Reset campaign
     */
    await Campaign.findByIdAndUpdate(
      campaign._id,
      {
        $set: {
          promoCode: null,
          discountAmount: 0,
          finalLaunchFee: campaign.launchFee,
          paymentStatus: campaignLunchPaymentStatus.NOT_INITIATED,
        },
      },
      { session }
    )

    /**
     * Delete payment + breakdown
     */
    await PaymentBreakDown.deleteOne(
      {
        payment: payment._id,
      },
      { session }
    )

    await Payment.deleteOne(
      {
        _id: payment._id,
      },
      { session }
    )

    await session.commitTransaction()
  } catch (err) {
    await session.abortTransaction()
    throw err
  } finally {
    session.endSession()
  }
}

export const handleDonationCheckoutPaymentSuccess = async (
  checkoutSession: Stripe.Checkout.Session
) => {
  if (checkoutSession.payment_status !== 'paid') {
    throw new AppError(httpStatus.BAD_REQUEST, 'Payment not paid yet.')
  }

  const { metadata } = checkoutSession

  const { campaign: campaignId, donation: donationId } =
    metadata as unknown as TDonationPaymentMetaData

  const sessionId = checkoutSession.id
  const paymentIntentId = checkoutSession.payment_intent

  if (!paymentIntentId || typeof paymentIntentId !== 'string') {
    throw new AppError(httpStatus.BAD_REQUEST, 'Payment intent not found.')
  }

  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId)

  if (!paymentIntent.latest_charge || typeof paymentIntent.latest_charge !== 'string') {
    throw new AppError(httpStatus.BAD_REQUEST, 'Charge not found.')
  }

  let charge = await stripe.charges.retrieve(paymentIntent.latest_charge)

  let retry = 5

  while (!charge.balance_transaction && retry > 0) {
    await sleep(1000)

    charge = await stripe.charges.retrieve(charge.id)

    retry--
  }

  if (!charge.balance_transaction) {
    throw new AppError(httpStatus.NOT_FOUND, 'Balance transaction is not available yet.')
  }

  const balanceTx = await stripe.balanceTransactions.retrieve(charge.balance_transaction as string)

  /**
   * Stripe calculation:
   *
   * Gross Amount
   *        |
   *        |- Stripe Fee
   *        |
   *        = balanceTx.net
   *
   * Organizer Amount:
   * balanceTx.net - Application Fee
   */

  const grossAmount = balanceTx.amount / 100
  const stripeFee = balanceTx.fee / 100
  const stripeNetAmount = balanceTx.net / 100

  let applicationFee = 0
  let applicationFeeId: string | undefined

  if (charge.application_fee) {
    const fee = await stripe.applicationFees.retrieve(charge.application_fee as string)

    applicationFeeId = fee.id
    applicationFee = fee.amount / 100
  }

  const organizerNetAmount = stripeNetAmount - applicationFee

  const mongoSession = await mongoose.startSession()

  try {
    mongoSession.startTransaction()

    // Prevent duplicate webhook processing
    const existingPayment = await DonationPayment.findOne({
      stripeCheckoutSessionId: sessionId,
      status: paymentStatus.PAID,
    }).session(mongoSession)

    if (existingPayment) {
      await mongoSession.commitTransaction()
      return existingPayment
    }

    const payment = await DonationPayment.findOneAndUpdate(
      {
        stripeCheckoutSessionId: sessionId,
        status: {
          $ne: paymentStatus.PAID,
        },
      },
      {
        $set: {
          status: paymentStatus.PAID,
          amount: grossAmount,

          stripePaymentIntentId: paymentIntentId,
          stripeChargeId: charge.id,
          stripeApplicationFeeId: applicationFeeId,
          stripeBalanceTransactionId: balanceTx.id,

          paidAt: new Date(),
        },
      },
      {
        sort: {
          createdAt: -1,
        },
        new: true,
        session: mongoSession,
      }
    )

    if (!payment) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Payment not found.')
    }

    const paymentBreakdownExists = await PaymentBreakDown.findOne({
      payment: payment._id,
    }).session(mongoSession)

    if (!paymentBreakdownExists) {
      await PaymentBreakDown.create(
        [
          {
            payment: payment._id,

            subtotal: grossAmount,
            totalAmount: grossAmount,

            stripeFee,
            platformFee: applicationFee,

            organizerAmount: organizerNetAmount,
            organizerAmountWithoutShipping: organizerNetAmount,

            discountAmount: 0,
          },
        ],
        {
          session: mongoSession,
        }
      )
    }

    // Update donation

    const donation = await Donation.findOneAndUpdate(
      {
        _id: donationId,
      },
      {
        $set: {
          totalAmount: grossAmount,
          status: DonationStatus.PAID,
        },
      },
      {
        session: mongoSession,
        new: true,
      }
    )

    if (!donation) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Donation failed to update.')
    }

    // Update campaign amount safely

    const campaign = await Campaign.findOneAndUpdate(
      {
        _id: campaignId,
      },
      {
        $inc: {
          raisedAmount: organizerNetAmount,
          raisedAmountWithShipping: organizerNetAmount,
        },
      },
      {
        session: mongoSession,
        new: true,
      }
    )

    if (!campaign) {
      throw new AppError(httpStatus.NOT_FOUND, 'Campaign not found.')
    }

    await mongoSession.commitTransaction()

    return payment
  } catch (error) {
    await mongoSession.abortTransaction()

    throw error
  } finally {
    await mongoSession.endSession()
  }
}

export const handleDonationCheckoutPaymentFailed = async (
  checkoutSession: Stripe.Checkout.Session
) => {
  const { metadata } = checkoutSession

  const { donation: donationId } = metadata as unknown as TDonationPaymentMetaData

  const sessionId = checkoutSession.id

  const mongoSession = await mongoose.startSession()

  try {
    mongoSession.startTransaction()

    // Prevent updating already completed payment
    const payment = await DonationPayment.findOne({
      stripeCheckoutSessionId: sessionId,
    }).session(mongoSession)

    if (!payment) {
      throw new AppError(httpStatus.NOT_FOUND, 'Payment not found.')
    }

    // If already paid, don't mark failed
    if (payment.status === paymentStatus.PAID) {
      await mongoSession.commitTransaction()
      return payment
    }

    const updatedPayment = await DonationPayment.findOneAndUpdate(
      {
        stripeCheckoutSessionId: sessionId,
      },
      {
        $set: {
          status: paymentStatus.FAILED,
        },
      },
      {
        session: mongoSession,
        new: true,
      }
    )

    if (!updatedPayment) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Payment update failed.')
    }

    // Update donation status
    if (donationId) {
      const donation = await Donation.findOneAndUpdate(
        {
          _id: donationId,
        },
        {
          $set: {
            status: DonationStatus.FAILED,
          },
        },
        {
          session: mongoSession,
          new: true,
        }
      )

      if (!donation) {
        throw new AppError(httpStatus.BAD_REQUEST, 'Donation update failed.')
      }
    }

    await mongoSession.commitTransaction()

    return updatedPayment
  } catch (error) {
    await mongoSession.abortTransaction()

    throw error
  } finally {
    await mongoSession.endSession()
  }
}

export const handleDonationPaymentIntentFailed = async (paymentIntent: Stripe.PaymentIntent) => {
  const { metadata } = paymentIntent

  const { donation: donationId } = metadata as unknown as TDonationPaymentMetaData

  const paymentIntentId = paymentIntent.id

  const mongoSession = await mongoose.startSession()

  try {
    mongoSession.startTransaction()

    // Find payment
    const payment = await DonationPayment.findOne({
      stripePaymentIntentId: paymentIntentId,
    }).session(mongoSession)

    if (!payment) {
      throw new AppError(httpStatus.NOT_FOUND, 'Payment not found.')
    }

    // Already paid, don't update as failed
    if (payment.status === paymentStatus.PAID) {
      await mongoSession.commitTransaction()
      return payment
    }

    const updatedPayment = await DonationPayment.findOneAndUpdate(
      {
        stripePaymentIntentId: paymentIntentId,
      },
      {
        $set: {
          status: paymentStatus.FAILED,
        },
      },
      {
        session: mongoSession,
        new: true,
      }
    )

    if (!updatedPayment) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Payment failed update.')
    }

    // Update donation
    if (donationId) {
      const donation = await Donation.findOneAndUpdate(
        {
          _id: donationId,
        },
        {
          $set: {
            status: DonationStatus.FAILED,
          },
        },
        {
          session: mongoSession,
          new: true,
        }
      )

      if (!donation) {
        throw new AppError(httpStatus.BAD_REQUEST, 'Donation failed update.')
      }
    }

    await mongoSession.commitTransaction()

    return updatedPayment
  } catch (error) {
    await mongoSession.abortTransaction()

    throw error
  } finally {
    await mongoSession.endSession()
  }
}
export const handleBrandBuilderPaymentIntentFailed = async (
  paymentIntent: Stripe.PaymentIntent
) => {
  const { metadata } = paymentIntent

  const { brandBuilderId } = metadata as unknown as IBrandBuilderMeta

  const paymentIntentId = paymentIntent.id

  const mongoSession = await mongoose.startSession()

  try {
    mongoSession.startTransaction()

    // Find payment
    const payment = await BrandBuilderPayment.findOne({
      stripePaymentIntentId: paymentIntentId,
    }).session(mongoSession)

    if (!payment) {
      throw new AppError(httpStatus.NOT_FOUND, 'Payment not found.')
    }

    // Already paid, don't update as failed
    if (payment.status === paymentStatus.PAID) {
      await mongoSession.commitTransaction()
      return payment
    }

    const updatedPayment = await BrandBuilderPayment.findOneAndUpdate(
      {
        stripePaymentIntentId: paymentIntentId,
      },
      {
        $set: {
          status: paymentStatus.FAILED,
        },
      },
      {
        session: mongoSession,
        new: true,
      }
    )

    if (!updatedPayment) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Payment failed update.')
    }

    // Update donation
    if (brandBuilderId) {
      const brandBuilder = await BrandBuilder.findOneAndUpdate(
        {
          _id: brandBuilderId,
        },
        {
          $set: {
            status: brandBuilderStatus.PAYMEMT_FAILED,
            failedAt: new Date(),
            failedReason: paymentIntent.last_payment_error,
          },
        },
        {
          session: mongoSession,
          new: true,
        }
      )

      if (!brandBuilder) {
        throw new AppError(httpStatus.BAD_REQUEST, 'Brand builder failed to update.')
      }
    }

    await mongoSession.commitTransaction()

    return updatedPayment
  } catch (error) {
    await mongoSession.abortTransaction()

    throw error
  } finally {
    await mongoSession.endSession()
  }
}

export const handleOrderCheckoutPaymentSuccess = async (
  checkoutSession: Stripe.Checkout.Session
) => {
  if (checkoutSession.payment_status !== 'paid') {
    throw new AppError(httpStatus.BAD_REQUEST, 'Payment not paid yet.')
  }

  const { metadata } = checkoutSession

  const {
    campaign: campaignId,
    order: orderId,
    shippingFee,
  } = metadata as unknown as TOrderPaymentMetaData

  if (!campaignId || !orderId) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Invalid checkout metadata.')
  }

  const sessionId = checkoutSession.id
  const paymentIntentId = checkoutSession.payment_intent

  if (!paymentIntentId || typeof paymentIntentId !== 'string') {
    throw new AppError(httpStatus.BAD_REQUEST, 'Payment intent not found.')
  }

  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId)

  if (!paymentIntent.latest_charge || typeof paymentIntent.latest_charge !== 'string') {
    throw new AppError(httpStatus.BAD_REQUEST, 'Charge not found.')
  }

  let charge = await stripe.charges.retrieve(paymentIntent.latest_charge)

  let retry = 5

  while (!charge.balance_transaction && retry > 0) {
    await sleep(1000)

    charge = await stripe.charges.retrieve(charge.id)

    retry--
  }

  if (!charge.balance_transaction) {
    throw new AppError(httpStatus.NOT_FOUND, 'Balance transaction is not available yet.')
  }

  const balanceTx = await stripe.balanceTransactions.retrieve(charge.balance_transaction as string)

  /**
   * Stripe calculation:
   *
   * Gross Amount
   *        |
   *        |- Stripe Fee
   *        |
   *        = balanceTx.net
   *
   * Organizer Amount:
   * balanceTx.net - Application Fee
   */

  const grossAmount = balanceTx.amount / 100
  const stripeFee = balanceTx.fee / 100
  const stripeNetAmount = balanceTx.net / 100

  let applicationFee = 0
  let applicationFeeId: string | undefined

  if (charge.application_fee) {
    const fee = await stripe.applicationFees.retrieve(charge.application_fee as string)

    applicationFeeId = fee.id
    applicationFee = fee.amount / 100
  }

  const shippingAmount = Number(shippingFee ?? 0)
  const organizerNetAmount = stripeNetAmount - applicationFee
  const organizerAmountWithoutShipping = organizerNetAmount - shippingAmount
  const subtotal = grossAmount - shippingAmount

  const mongoSession = await mongoose.startSession()

  try {
    mongoSession.startTransaction()
    // ?? Check is the payment already paid ?:
    const existingPayment = await OrderPayment.findOne({
      stripeCheckoutSessionId: sessionId,
      status: paymentStatus.PAID,
    }).session(mongoSession)
    if (existingPayment) {
      await mongoSession.abortTransaction()
      return existingPayment
    }

    const payment = await OrderPayment.findOneAndUpdate(
      {
        stripeCheckoutSessionId: sessionId,
        status: paymentStatus.PENDING,
      },
      {
        $set: {
          status: paymentStatus.PAID,
          currency: balanceTx.currency,
          amount: grossAmount,
          stripePaymentIntentId: paymentIntentId,
          stripeChargeId: charge.id,
          stripeApplicationFeeId: applicationFeeId,
          stripeBalanceTransactionId: balanceTx.id,
          paidAt: new Date(),
          checkoutUrl: null,
        },
      },
      {
        returnDocument: 'after',
        session: mongoSession,
      }
    )

    if (!payment) {
      const existing = await OrderPayment.findOne({
        stripeCheckoutSessionId: sessionId,
        status: paymentStatus.PAID,
      }).session(mongoSession)

      if (existing) {
        await mongoSession.abortTransaction()
        return existing
      }

      throw new AppError(httpStatus.BAD_REQUEST, 'Failed to update payment')
    }

    const [paymentBreakdown] = await PaymentBreakDown.create(
      [
        {
          payment: payment._id,
          subtotal: subtotal,
          totalAmount: grossAmount,
          stripeFee,
          platformFee: applicationFee,
          organizerAmount: organizerNetAmount,
          organizerAmountWithoutShipping: organizerAmountWithoutShipping,
        },
      ],
      {
        session: mongoSession,
      }
    )

    if (!paymentBreakdown) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Failed to update payment breakdown')
    }

    // ?? Update Order Status
    const order = await Order.findOneAndUpdate(
      { _id: orderId },
      {
        $set: {
          subtotal,
          shippingAmount: shippingAmount,
          totalAmount: grossAmount,
          status: OrderStatus.PAID,
        },
      },
      {
        returnDocument: 'after',
        session: mongoSession,
      }
    )
    if (!order) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Failed to update order')
    }

    // ?? Update The campaign raised amount:
    const campaign = await Campaign.findOneAndUpdate(
      {
        _id: campaignId,
      },
      {
        $inc: {
          raisedAmount: organizerAmountWithoutShipping,
          raisedAmountWithShipping: organizerNetAmount,
        },
      },
      {
        returnDocument: 'after',
        session: mongoSession,
      }
    )

    if (!campaign) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Failed to update order')
    }

    await mongoSession.commitTransaction()

    return payment
  } catch (error) {
    if (mongoSession.inTransaction()) {
      await mongoSession.abortTransaction()
    }

    throw error
  } finally {
    await mongoSession.endSession()
  }
}

export const handleOrderCheckoutExpired = async (checkoutSession: Stripe.Checkout.Session) => {
  const mongoSession = await mongoose.startSession()

  try {
    mongoSession.startTransaction()
    const payment = await OrderPayment.findOneAndUpdate(
      {
        stripeCheckoutSessionId: checkoutSession.id,
        status: paymentStatus.PENDING,
      },
      {
        $set: {
          status: paymentStatus.FAILED,
          expiredAt: new Date(),
        },
      },
      {
        returnDocument: 'after',
        session: mongoSession,
      }
    )

    if (!payment) {
      await mongoSession.abortTransaction()
      return null
    }

    const updatedOrder = await Order.findByIdAndUpdate(
      payment.order,
      {
        $set: {
          status: OrderStatus.PAYMENT_FAILED,
        },
      },
      {
        returnDocument: 'after',
        session: mongoSession,
      }
    )

    if (!updatedOrder) {
      throw new AppError(httpStatus.NOT_FOUND, 'Failed to update order.')
    }

    // ?? Check order items and release quantity for limited stock products:
    const orderItems = await OrderItem.find({
      order: updatedOrder._id,
    }).session(mongoSession)

    // ?? Restock products quantity (for limited quantity products)
    const restockPromises = orderItems?.map((orderItem) => {
      const reservedQuantity = orderItem?.quantity || 0

      return PhysicalProduct.findOneAndUpdate(
        {
          _id: orderItem?.product,
          productType: productType.PHYSICAL,
          isUnlimited: false,
        },
        {
          $inc: {
            stock: reservedQuantity,
          },
        },
        {
          returnDocument: 'after',
          session: mongoSession,
        }
      )
    })

    await Promise.all(restockPromises)

    await mongoSession.commitTransaction()
    return payment
  } catch (error) {
    await mongoSession.abortTransaction()
    throw error
  } finally {
    await mongoSession.endSession()
  }
}

export const handleOrderPaymentFailed = async (paymentIntent: Stripe.PaymentIntent) => {
  // ?? mongo session:
  const mongoSession = await mongoose.startSession()

  try {
    mongoSession.startTransaction()
    const payment = await OrderPayment.findOneAndUpdate(
      {
        stripePaymentIntentId: paymentIntent.id,
        status: paymentStatus.PENDING,
      },
      {
        $set: {
          status: paymentStatus.FAILED,
          failedAt: new Date(),
          failureReason: paymentIntent.last_payment_error?.message ?? 'Payment failed.',
        },
      },
      {
        returnDocument: 'after',
        session: mongoSession,
      }
    )

    if (!payment) {
      await mongoSession.abortTransaction()
      return null
    }

    const updatedOrder = await Order.findByIdAndUpdate(
      payment.order,
      {
        $set: {
          status: OrderStatus.PAYMENT_FAILED,
        },
      },
      {
        returnDocument: 'after',
        session: mongoSession,
      }
    )

    if (!updatedOrder) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Failed to update the order.')
    }

    // ?? Check order items and release quantity for limited stock products:
    const orderItems = await OrderItem.find({
      order: updatedOrder._id,
    }).session(mongoSession)

    // ?? Restock products quantity (for limited quantity products)
    const restockPromises = orderItems?.map((orderItem) => {
      const reservedQuantity = orderItem?.quantity || 0

      return PhysicalProduct.findOneAndUpdate(
        {
          _id: orderItem?.product,
          productType: productType.PHYSICAL,
          isUnlimited: false,
        },
        {
          $inc: {
            stock: reservedQuantity,
          },
        },
        {
          returnDocument: 'after',
          session: mongoSession,
        }
      )
    })

    await Promise.all(restockPromises)

    await mongoSession.commitTransaction()
    return payment
  } catch (error) {
    await mongoSession.abortTransaction()
    throw error
  } finally {
    await mongoSession.endSession()
  }
}

export const handleBrandBuilderCheckoutExpired = async (
  checkoutSession: Stripe.Checkout.Session
) => {
  const mongoSession = await mongoose.startSession()

  try {
    mongoSession.startTransaction()
    const payment = await BrandBuilderPayment.findOneAndUpdate(
      {
        stripeCheckoutSessionId: checkoutSession.id,
        status: paymentStatus.PENDING,
      },
      {
        $set: {
          status: paymentStatus.FAILED,
          expiredAt: new Date(),
        },
      },
      {
        returnDocument: 'after',
        session: mongoSession,
      }
    )

    if (!payment) {
      await mongoSession.abortTransaction()
      return null
    }

    const brandBuilder = await BrandBuilder.findByIdAndUpdate(
      payment.brandBuilderId,
      {
        $set: {
          status: brandBuilderStatus.PAYMEMT_FAILED,
        },
      },
      {
        returnDocument: 'after',
        session: mongoSession,
      }
    )

    if (!brandBuilder) {
      throw new AppError(httpStatus.NOT_FOUND, 'Failed to update order.')
    }

    await mongoSession.commitTransaction()
    return payment
  } catch (error) {
    await mongoSession.abortTransaction()
    throw error
  } finally {
    await mongoSession.endSession()
  }
}

export const handlePayoutPaid = async (payout: Stripe.Payout) => {
  const payoutId = payout.id
  const session = await mongoose.startSession()

  try {
    session.startTransaction()

    const dbPayout = await Payout.findOneAndUpdate(
      { stripePayoutId: payoutId },
      { status: PayoutStatus.PAID, paidAt: new Date() },
      { new: true, session }
    )

    if (!dbPayout) {
      await session.abortTransaction()
      return
    }

    await PayoutPayment.findOneAndUpdate(
      { stripePayoutId: payoutId },
      { status: paymentStatus.PAID, paidAt: new Date() },
      { session }
    )

    await Campaign.findByIdAndUpdate(
      dbPayout.campaign,
      {
        status: CampaignStatus.PAID_OUT,
        paidOutAt: new Date(),
      },
      { session }
    )

    await session.commitTransaction()
  } catch (error) {
    await session.abortTransaction()
    throw error
  } finally {
    await session.endSession()
  }
}

export const handlePayoutFailed = async (payout: Stripe.Payout) => {
  const payoutId = payout.id
  const session = await mongoose.startSession()

  try {
    session.startTransaction()

    const dbPayout = await Payout.findOneAndUpdate(
      { stripePayoutId: payoutId },
      {
        status: PayoutStatus.FAILED,
        failedAt: new Date(),
        failureCode: payout.failure_code ?? 'unknown',
        failureMessage: payout.failure_message ?? 'Payout failed',
      },
      { new: true, session }
    )

    if (!dbPayout) {
      await session.abortTransaction()
      return
    }

    await PayoutPayment.findOneAndUpdate(
      { stripePayoutId: payoutId },
      { status: paymentStatus.FAILED, failedAt: new Date() },
      { session }
    )

    await Campaign.findByIdAndUpdate(
      dbPayout.campaign,
      {
        status: CampaignStatus.COMPLETED,
        expectedPayoutDate: moment().add(1, 'days').toDate(),
      },
      { session }
    )

    await session.commitTransaction()
  } catch (error) {
    await session.abortTransaction()
    throw error
  } finally {
    await session.endSession()
  }
}

export const handlePayoutCanceled = async (payout: Stripe.Payout) => {
  const payoutId = payout.id
  const session = await mongoose.startSession()

  try {
    session.startTransaction()

    const dbPayout = await Payout.findOneAndUpdate(
      { stripePayoutId: payoutId },
      { status: PayoutStatus.CANCELED, canceledAt: new Date() },
      { new: true, session }
    )

    if (!dbPayout) {
      await session.abortTransaction()
      return
    }

    await PayoutPayment.findOneAndUpdate(
      { stripePayoutId: payoutId },
      { status: paymentStatus.CANCELLED },
      { session }
    )

    await Campaign.findByIdAndUpdate(
      dbPayout.campaign,
      {
        status: CampaignStatus.COMPLETED,
        expectedPayoutDate: moment().add(1, 'days').toDate(),
      },
      { session }
    )

    await session.commitTransaction()
  } catch (error) {
    await session.abortTransaction()
    throw error
  } finally {
    await session.endSession()
  }
}
