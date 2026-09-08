import { catchAsync, sendResponse } from '@repo/shared'
import httpStatus from 'http-status'
import { contentServices } from './content.services'
import type { TContentType } from 'packages/db/src'

const updateContentType = catchAsync(async (req, res) => {
  const result = await contentServices.updateContentType(
    req.params.type as TContentType,
    req.body.content
  )

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'The content updated successfully!',
    data: result,
  })
})

const getContentType = catchAsync(async (req, res) => {
  const result = await contentServices.getContentByType(req.params.type as TContentType)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'The content retrieved successfully!',
    data: result,
  })
})

export const contentControllers = {
  updateContentType,
  getContentType,
}
