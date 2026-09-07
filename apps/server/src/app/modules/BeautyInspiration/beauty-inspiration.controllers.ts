import { catchAsync, sendResponse } from '@repo/shared'
import httpStatus from 'http-status'
import { beautyInspirationServices } from './beauty-inspiration.services'
import type { TMulterFile } from 'packages/media-hub/src'

const createBeautyInspiration = catchAsync(async (req, res) => {
  const image = req.file as TMulterFile
  const result = await beautyInspirationServices.createBeautyInspiration(req.body, image)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.CREATED,
    message: 'The beauty inspiration created successfully!',
    data: result,
  })
})

const updateBeautyInspiration = catchAsync(async (req, res) => {
  const image = req.file as TMulterFile
  const result = await beautyInspirationServices.updateBeautyInspiration(
    req.params.id as string,
    req.body,
    image
  )

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'The beauty inspiration updated successfully!',
    data: result,
  })
})

const getAllBeautyInspiration = catchAsync(async (req, res) => {
  const result = await beautyInspirationServices.getAllBeautyInspiration(req.query)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'The beauty inspiration retrieved successfully!',
    data: result.data,
    meta: result.meta,
  })
})

const getBeautyInspirationById = catchAsync(async (req, res) => {
  const result = await beautyInspirationServices.getBeautyInspirationById(req.params.id as string)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'The beauty inspiration retrieved successfully!',
    data: result,
  })
})

const deleteBeautyInspirationById = catchAsync(async (req, res) => {
  const result = await beautyInspirationServices.deleteBeautyInspirationById(
    req.params.id as string
  )

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'The beauty inspiration deleted successfully!',
    data: result,
  })
})

export const beautyInspirationControllers = {
  createBeautyInspiration,
  updateBeautyInspiration,
  getAllBeautyInspiration,
  getBeautyInspirationById,
  deleteBeautyInspirationById,
}
