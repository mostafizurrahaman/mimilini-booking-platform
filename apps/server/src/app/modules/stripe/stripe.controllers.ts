import { ProcessedStripeEvent } from '@repo/db'
import httpStatus from 'http-status'
import { catchAsync, sendResponse } from '@repo/shared'
import { verifyWebHookSignature } from '@app/libs/stripe'
import configs from '@app/configs'
import { stripeServices } from './stripe.services'
import moment from 'moment'
import { logger } from '@app/libs'

// const handleStripeWebhookForPlatform = catchAsync(async (req, res) => {
//   //   Extract event from the header:
//   const event = verifyWebHookSignature(configs.stripe.webhookPlatformKey, req)

//   // ?? Check the event ID:
//   const isAlreadyProcessed = await ProcessedStripeEvent.findOne({
//     eventId: event?.id,
//   })

//   if (isAlreadyProcessed) {
//     return sendResponse(res, {
//       statusCode: httpStatus.OK,
//       success: true,
//       message: 'Webhook already processed (Idempotency skip).',
//       data: null,
//     })
//   }

//   await stripeServices.listenStripeEventsForPlatformAccount(event)

//   // ?? Update the event:
//   await ProcessedStripeEvent.create({
//     eventId: event.id,
//     createdAt: moment().utc().toDate(),
//   })

//   sendResponse(res, {
//     statusCode: httpStatus.OK,
//     success: true,
//     message: 'Webhook triggered successfully!',
//     data: null,
//   })
// })

// const handleStripeWebhookForConnectedAccount = catchAsync(async (req, res) => {
//   //   Extract event from the header:
//   const event = verifyWebHookSignature(configs.stripe.webhookConnectedAccountKey, req)

//   // ?? Check the event ID:
//   const isAlreadyProcessed = await ProcessedStripeEvent.findOne({
//     eventId: event?.id,
//   })

//   if (isAlreadyProcessed) {
//     return sendResponse(res, {
//       statusCode: httpStatus.OK,
//       success: true,
//       message: 'Webhook already processed (Idempotency skip).',
//       data: null,
//     })
//   }

//   await stripeServices.listenStripeEventsForConnectedAccount(event)

//   // ?? Update the event:
//   await ProcessedStripeEvent.create({
//     eventId: event.id,
//     createdAt: moment().utc().toDate(),
//   })

//   sendResponse(res, {
//     statusCode: httpStatus.OK,
//     success: true,
//     message: 'Webhook triggered successfully!',
//     data: null,
//   })
// })

const handleStripeWebhookForLocal = catchAsync(async (req, res) => {
  const event = verifyWebHookSignature(configs.stripe.webhookKey, req)

  logger.info(`[Stripe Event Received] ${event.type} (${event.id})`)

  // Atomic idempotency reservation to eliminate race conditions
  try {
    await ProcessedStripeEvent.create({
      eventId: event.id,
      createdAt: moment().utc().toDate(),
    })
  } catch (err: any) {
    if (err?.code === 11000) {
      return sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Webhook already processed (Idempotency skip).',
        data: null,
      })
    }
    throw err
  }

  await stripeServices.listenStripeEventsForConnectedAccount(event)

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Webhook triggered successfully!',
    data: null,
  })
})
export const stripeController = {
  // handleStripeWebhookForPlatform,
  // handleStripeWebhookForConnectedAccount,
  handleStripeWebhookForLocal,
}
