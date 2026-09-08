import { catchAsync, sendResponse } from '@repo/shared'
import httpStatus from 'http-status'
import { faqServices } from './faq.services'

const createFaq = catchAsync(async (req, res) => {
  const result = await faqServices.createFaq(req.body)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.CREATED,
    message: 'The faq created successfully!',
    data: result,
  })
})

const updateFaq = catchAsync(async (req, res) => {
  const result = await faqServices.updateFaq(req.params.id as string, req.body)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'The faq updated successfully!',
    data: result,
  })
})

const getAllFaq = catchAsync(async (req, res) => {
  const result = await faqServices.getAllFaq(req.query)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'The faq retrieved successfully!',
    data: result.data,
    meta: result.meta,
  })
})

const getFaqById = catchAsync(async (req, res) => {
  const result = await faqServices.getFaqById(req.params.id as string)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'The faq retrieved successfully!',
    data: result,
  })
})

const deleteFaqById = catchAsync(async (req, res) => {
  const result = await faqServices.deleteFaqById(req.params.id as string)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'The faq deleted successfully!',
    data: result,
  })
})

export const faqControllers = {
  createFaq,
  updateFaq,
  getAllFaq,
  getFaqById,
  deleteFaqById,
}
