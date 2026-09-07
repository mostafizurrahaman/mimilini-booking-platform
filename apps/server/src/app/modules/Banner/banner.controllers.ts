import { catchAsync, sendResponse } from '@repo/shared'
import httpStatus from 'http-status'
import { bannerServices } from './banner.services'
import { getUserFromRequest } from '@app/libs'
import type { TMulterFile } from 'packages/media-hub/src'
import type { TGetAllActiveBannerQueryParamsType } from './banner.validations'

const createBanner = catchAsync(async (req, res) => {
  const user = await getUserFromRequest(req)
  const file = req.file as TMulterFile
  const result = await bannerServices.createBanner(user, req.body, file)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.CREATED,
    message: 'The banner created successfully!',
    data: result,
  })
})

const updateBanner = catchAsync(async (req, res) => {
  const file = req.file as TMulterFile
  const result = await bannerServices.updateBanner(req.params.bannerId as string, req.body, file)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'The banner updated successfully!',
    data: result,
  })
})

const updateBannerStatus = catchAsync(async (req, res) => {
  const result = await bannerServices.updateBannerStatus(req.params.bannerId as string, req.body)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'The banner status updated successfully!',
    data: result,
  })
})

const getAllBanner = catchAsync(async (req, res) => {
  const result = await bannerServices.getAllBanner(req.query)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'The banner retrieved successfully!',
    data: result.data,
    meta: result.meta,
  })
})

const getAllActiveBanner = catchAsync(async (req, res) => {
  const result = await bannerServices.getAllActiveBanner(
    req.query as unknown as TGetAllActiveBannerQueryParamsType
  )

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'all active banners are retrieved successfully!',
    data: result.data,
    meta: result.meta,
  })
})

const getBannerById = catchAsync(async (req, res) => {
  const result = await bannerServices.getBannerById(req.params.id as string)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'The banner retrieved successfully!',
    data: result,
  })
})

const deleteBannerById = catchAsync(async (req, res) => {
  const result = await bannerServices.deleteBannerById(req.params.id as string)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'The banner deleted successfully!',
    data: result,
  })
})

export const bannerControllers = {
  createBanner,
  updateBanner,
  getAllBanner,
  getBannerById,
  deleteBannerById,
  getAllActiveBanner,
  updateBannerStatus,
}
