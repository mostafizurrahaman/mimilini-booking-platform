import { logger } from '@app/libs/logger'
import { catchAsync } from '@repo/shared'
import type { ZodObject } from 'zod'

export const validateRequest = (schema: ZodObject) => {
  return catchAsync(async (req, res, next) => {
    logger.debug('Data before validation', {
      body: req.body,
      params: req.params,
      query: req.query,
      cookies: req.cookies,
    })
    const { data, success, error } = await schema.safeParseAsync({
      body: req.body,
      params: req.params,
      query: req.query,
      cookies: req.cookies,
    })

    logger.debug('After Validation', data)

    if (success) {
      if (data.body) {
        req.body = data.body
      }

      if (data.cookies) {
        req.cookies = data.cookies
      }

      next()
    } else {
      console.log(error)
      next(error)
    }
  })
}
