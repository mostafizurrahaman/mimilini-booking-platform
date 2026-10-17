import { PaymentMethod, paymentMethodSearchableFields, type IUserDoc } from '@repo/db'
import httpStatus from 'http-status'
import { AppError } from '@repo/shared'
import mongoose, {  type PipelineStage } from 'mongoose'

import type {
  TAddPaymentMethodPayloadType,
  TGetAllPaymentMethodQueryParamsType,
} from './payment-method.validations'
import {
  createStripeCustomer,
  customerPaymentIntent,
  retrievedPaymentMethodAndAttach,
  stripe,
} from '@app/libs/stripe'
import { logger } from '@app/libs'

const setupIntent = async (user: IUserDoc) => {
  let stripeCustomerId = user.stripeCustomerId ?? null

  // Create customer if not exists :
  if (!stripeCustomerId) {
    stripeCustomerId = await createStripeCustomer({
      name: user?.name,
      email: user?.email,
      phone: user.phone ?? '',
    })

    user.stripeCustomerId = stripeCustomerId as string

    await user.save()
  }

  // Setup payment intent:
  const intent = await customerPaymentIntent(stripeCustomerId)

  return {
    clientSecret: intent.client_secret,
    customerId: stripeCustomerId,
  }
}

const addPaymentMethod = async (user: IUserDoc, payload: TAddPaymentMethodPayloadType) => {
  const { isDefault, paymentMethodId } = payload

  if (!user?.stripeCustomerId) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Setup payment intent first.')
  }

  // Retrieved Payment method and attach to customer:
  const paymentMethod = await retrievedPaymentMethodAndAttach(
    paymentMethodId,
    user.stripeCustomerId
  )

  // Check is any default card exists?:
  const existingDefault = await PaymentMethod.findOne({
    user: user?._id,
    isDefault: true,
  })

  // ?? Default:
  const shouldBeDefault = !existingDefault || Boolean(isDefault)

  // Remove others from default:
  if (shouldBeDefault && existingDefault) {
    await PaymentMethod.updateMany(
      {
        user: user?._id,
        isDefault: true,
      },
      {
        $set: {
          isDefault: false,
        },
      }
    )
  }

  let paymentType: 'card' | 'apple_pay' | 'google_pay' = 'card'

  if (paymentMethod.card?.wallet?.type === 'apple_pay') {
    paymentType = 'apple_pay'
  } else if (paymentMethod.card?.wallet?.type === 'google_pay') {
    paymentType = 'google_pay'
  } else {
    paymentType = 'card'
  }

  // Save paymentMethod:
  const savePaymentMethod = await PaymentMethod.create({
    user: user?._id,
    stripePaymentMethodId: paymentMethod.id,
    type: paymentType,
    cardBrand: paymentMethod?.card?.brand as string,
    last4: paymentMethod?.card?.last4 as string,
    expMonth: paymentMethod.card?.exp_month as number,
    expYear: paymentMethod.card?.exp_year as number,
    isDefault: shouldBeDefault,
  })

  return savePaymentMethod
}

const markAsDefault = async (user: IUserDoc, id: string) => {
  const paymentMethod = await PaymentMethod.findOne({
    user: user?._id,
    _id: id,
  })

  if (paymentMethod?.isDefault) return PaymentMethod

  if (!paymentMethod) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Payment method not found.')
  }

  await PaymentMethod.updateMany(
    {
      user: user?._id,
      _id: {
        $ne: paymentMethod?._id,
      },
    },
    {
      $set: {
        isDefault: false,
      },
    }
  )

  paymentMethod.isDefault = true

  await paymentMethod.save()

  return paymentMethod
}

const getAllPaymentMethod = async (user: IUserDoc, query: TGetAllPaymentMethodQueryParamsType) => {
  const {
    page = 1,
    limit = 10,
    searchTerm,
    sortOrder = 'desc',
    sortBy = 'createdAt',
    fromDate,
    toDate,
  } = query

  const skip = (page - 1) * limit
  const pipeline: PipelineStage[] = []

  pipeline.push({
    $match: {
      user: user?._id,
    },
  })

  if (fromDate || toDate) {
    const dateFilter: Record<string, unknown> = {}
    if (fromDate) dateFilter.$gte = new Date(fromDate)
    if (toDate) dateFilter.$lte = new Date(toDate)

    pipeline.push({ $match: { createdAt: dateFilter } })
  }

  if (searchTerm) {
    pipeline.push({
      $match: {
        $or: paymentMethodSearchableFields.map((field) => ({
          [field]: { $regex: searchTerm, $options: 'i' },
        })),
      },
    })
  }

  pipeline.push({ $sort: { [sortBy]: sortOrder === 'asc' ? 1 : -1 } })

  pipeline.push({
    $facet: {
      data: [{ $skip: skip }, { $limit: limit }],
      meta: [{ $count: 'total' }],
    },
  })

  const aggregated = await PaymentMethod.aggregate(pipeline)

  const data = aggregated?.[0]?.data || []
  const total = aggregated?.[0]?.meta?.[0]?.total || 0

  return {
    data,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  }
}

const getPaymentMethodById = async (user: IUserDoc, id: string) => {
  const result = await PaymentMethod.findOne({
    user: user?._id,
    _id: id,
  })

  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, 'PaymentMethod not found')
  }

  return result
}

const deletePaymentMethodById = async (user: IUserDoc, id: string) => {
  const result = await PaymentMethod.findOne({ user: user?._id, _id: id })

  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, 'PaymentMethod not found')
  }

  // TODO: Check any pending booking exists with this CARD Which balance payment is pending:

  const mongoSession = await mongoose.startSession()

  try {

    mongoSession.startTransaction()


    // Was default: 
    const wasDefault = result?.isDefault;   


  await result.deleteOne({ 
    session: mongoSession
  })

  if (wasDefault) { 
    await PaymentMethod.findOneAndUpdate(
      {
        user: user?._id,
        _id: { $ne: result._id }
      },
      {
        $set: {
          isDefault: true,
        },
      }, 
      { 
        sort: { 
          createdAt: -1
        },
        session: mongoSession
      }
    )
    
  }


    await mongoSession.commitTransaction();

    await stripe.paymentMethods.detach(result.stripePaymentMethodId as string).catch((err)=> { 
      logger.error("[ Stripe detach error: ]", err)
    })

    return result
  } catch (error) {

    if (mongoSession.inTransaction()) {
      await mongoSession.abortTransaction();
    }

    throw error;
  } finally {
    await mongoSession.endSession();
  }
}

export const paymentMethodServices = {
  setupIntent,
  addPaymentMethod,
  markAsDefault,
  getAllPaymentMethod,
  getPaymentMethodById,
  deletePaymentMethodById,
}
