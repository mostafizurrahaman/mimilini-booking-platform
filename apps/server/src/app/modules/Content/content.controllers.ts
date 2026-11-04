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
    message: 'Content updated successfully!',
    data: result,
  })
})

const getContentType = catchAsync(async (req, res) => {
  const result = await contentServices.getContentByType(req.params.type as TContentType)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Content retrieved successfully!',
    data: result,
  })
})

const getAllContent = catchAsync(async (req, res) => {
  const result = await contentServices.getAllContent()

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Contents retrieved successfully!',
    data: result,
  })
})

export const contentControllers = {
  updateContentType,
  getContentType,
  getAllContent,
}
