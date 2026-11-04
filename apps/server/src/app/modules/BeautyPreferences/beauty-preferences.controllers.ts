import { catchAsync, sendResponse } from '@repo/shared'
import httpStatus from 'http-status'
import { beautyPreferencesServices } from './beauty-preferences.services'
import { getUserFromRequest } from '@app/libs'

const createBeautyPreferences = catchAsync(async (req, res) => {
  const user = await getUserFromRequest(req)
  const result = await beautyPreferencesServices.createBeautyPreferences(user, req.body)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.CREATED,
    message: 'Beauty preferences created successfully!',
    data: result,
  })
})

const deleteBeautyPreferencesById = catchAsync(async (req, res) => {
  const user = await getUserFromRequest(req)
  const result = await beautyPreferencesServices.deleteBeautyPreferencesById(user, req.body)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Beauty preferences removed successfully!',
    data: result,
  })
})

export const beautyPreferencesControllers = {
  createBeautyPreferences,
  deleteBeautyPreferencesById,
}
