import { BeautyPreferences, Category, type IUserDoc } from '@repo/db'
import httpStatus from 'http-status'
import { AppError } from '@repo/shared'

import type {
  TCreateBeautyPreferencesPayloadType,
  TDeleteBeautyPreferencesByIdPayloadType,
} from './beauty-preferences.validations'

const createBeautyPreferences = async (
  user: IUserDoc,
  payload: TCreateBeautyPreferencesPayloadType
) => {
  const { category } = payload

  // beauty preference:
  const existingCategory = await Category.findById(category)
  if (!existingCategory) {
    throw new AppError(httpStatus.NOT_FOUND, 'Category not found.')
  }

  if (!existingCategory.isActive) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Category is not active.')
  }

  // Check is this category already exists on this user preference ?:
  const duplicatePreference = await BeautyPreferences.findOne({
    category: existingCategory._id,
    customer: user?._id,
  })

  if (duplicatePreference) {
    throw new AppError(httpStatus.CONFLICT, 'This category preference has already been added. ')
  }

  const result = await BeautyPreferences.create({
    category: existingCategory._id,
    customer: user?._id,
  })
  return result
}

const deleteBeautyPreferencesById = async (
  user: IUserDoc,
  payload: TDeleteBeautyPreferencesByIdPayloadType
) => {
  const { category } = payload

  const result = await BeautyPreferences.findOneAndDelete({
    category: category,
    customer: user?._id,
  })

  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, 'BeautyPreferences not found')
  }

  return result
}

export const beautyPreferencesServices = {
  createBeautyPreferences,
  deleteBeautyPreferencesById,
}
