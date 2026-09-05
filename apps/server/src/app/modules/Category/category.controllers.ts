import { catchAsync, sendResponse } from '@repo/shared'
import httpStatus from 'http-status'
import { categoryServices } from './category.services'
import { getUserFromRequest } from '@app/libs'

const createCategory = catchAsync(async (req, res) => {
  const user = await getUserFromRequest(req)
  const result = await categoryServices.createCategory(user, req.body)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.CREATED,
    message: 'The category created successfully!',
    data: result,
  })
})

const updateCategory = catchAsync(async (req, res) => {
  const result = await categoryServices.updateCategory(req.params.id as string, req.body)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'The category updated successfully!',
    data: result,
  })
})

const getAllCategory = catchAsync(async (req, res) => {
  const result = await categoryServices.getAllCategory(req.query)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'The category retrieved successfully!',
    data: result.data,
    meta: result.meta,
  })
})

const getCategoryById = catchAsync(async (req, res) => {
  const result = await categoryServices.getCategoryById(req.params.id as string)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'The category retrieved successfully!',
    data: result,
  })
})

const deleteCategoryById = catchAsync(async (req, res) => {
  const result = await categoryServices.deleteCategoryById(req.params.id as string)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'The category deleted successfully!',
    data: result,
  })
})

export const categoryControllers = {
  createCategory,
  updateCategory,
  getAllCategory,
  getCategoryById,
  deleteCategoryById,
}
