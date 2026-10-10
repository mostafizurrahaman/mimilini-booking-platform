import { catchAsync, sendResponse } from '@repo/shared'
import httpStatus from 'http-status'
import { platformSettingsServices } from './platform-settings.services'
import { getUserFromRequest } from '@app/libs'

const createPlatformSettings = catchAsync(async (req, res) => {
  const user = await getUserFromRequest(req)
  const result = await platformSettingsServices.createPlatformSettings(
    user,
    req.body
  )

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.CREATED,
    message: 'Platform settings created successfully!',
    data: result,
  })
})

const updatePlatformSettings = catchAsync(async (req, res) => {
  const user = await getUserFromRequest(req)
  const result = await platformSettingsServices.updatePlatformSettings(
    user,
    req.body
  )

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Platform settings updated successfully!',
    data: result,
  })
})

const getPlatformSettings = catchAsync(async (_req, res) => {
  const result = await platformSettingsServices.getPlatformSettings()

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Platform settings retrieved successfully!',
    data: result,
  })
})

export const platformSettingsControllers = {
  createPlatformSettings,
  updatePlatformSettings,
  getPlatformSettings,
}