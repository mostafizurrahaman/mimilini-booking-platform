import { PlatformSettings, type IUser } from '@repo/db'
import httpStatus from 'http-status'
import { AppError } from '@repo/shared'
import { Types } from 'mongoose'
import type {
  TCreatePlatformSettingsPayloadType,
  TUpdatePlatformSettingsPayloadType,
} from './platform-settings.validations'

/**
 * 1. Create Platform Settings (Singleton)
 * Edge Case: Only one platform settings document can exist.
 */
const createPlatformSettings = async (
  user: IUser,
  payload: TCreatePlatformSettingsPayloadType
) => {
  // Check if platform settings already exist
  const existingSettings = await PlatformSettings.findOne()
  if (existingSettings) {
    throw new AppError(
      httpStatus.CONFLICT,
      'Platform settings already exist. Please update the existing settings instead.'
    )
  }

  const result = await PlatformSettings.create({
    ...payload,
    updatedBy: user._id,
  })

  return await PlatformSettings.findById(result._id).populate(
    'updatedBy',
    'name email role'
  )
}

/**
 * 2. Update Platform Settings
 * Edge Cases:
 * - Can update by ID or singleton fallback
 * - Validates ObjectId format if ID is passed
 * - Validates mediumMaxAmount > lowMaxAmount against DB state
 * - Flattens nested low/medium/high subdocuments to avoid erasing sibling fee fields
 */
const updatePlatformSettings = async (
  user: IUser,
  payload: TUpdatePlatformSettingsPayloadType,
  id?: string
) => {
  if (id && !Types.ObjectId.isValid(id)) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Invalid platform settings ID format')
  }

  // Find existing document
  const existingSettings = id
    ? await PlatformSettings.findById(id)
    : await PlatformSettings.findOne().sort({ createdAt: -1 })

  if (!existingSettings) {
    throw new AppError(
      httpStatus.NOT_FOUND,
      'Platform settings not found. Please create platform settings first.'
    )
  }

  // Cross-field validation against existing database values
  const effectiveLowMax = payload.lowMaxAmount ?? existingSettings.lowMaxAmount
  const effectiveMediumMax =
    payload.mediumMaxAmount ?? existingSettings.mediumMaxAmount

  if (effectiveMediumMax <= effectiveLowMax) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Medium tier max amount must be strictly greater than low tier max amount'
    )
  }

  // Construct update payload with nested dot-notation flattening
  const updateData: Record<string, unknown> = {
    updatedBy: user._id,
  }

  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined) continue
    if (key === 'low' || key === 'medium' || key === 'high') {
      for (const [subKey, subVal] of Object.entries(
        value as Record<string, unknown>
      )) {
        if (subVal !== undefined) {
          updateData[`${key}.${subKey}`] = subVal
        }
      }
    } else {
      updateData[key] = value
    }
  }

  const result = await PlatformSettings.findByIdAndUpdate(
    existingSettings._id,
    { $set: updateData },
    { new: true, runValidators: true }
  ).populate('updatedBy', 'name email role')

  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, 'Platform settings not found')
  }

  return result
}

/**
 * 3. Get Platform Settings
 * Edge Cases:
 * - Can retrieve by ID or fallback to latest singleton document
 * - Validates ObjectId format if ID is passed
 * - Populates admin who last updated settings
 */
const getPlatformSettings = async (id?: string) => {
  if (id && !Types.ObjectId.isValid(id)) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Invalid platform settings ID format')
  }

  const result = id
    ? await PlatformSettings.findById(id).populate('updatedBy', 'name email role')
    : await PlatformSettings.findOne()
        .sort({ createdAt: -1 })
        .populate('updatedBy', 'name email role')

  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, 'Platform settings not found')
  }

  return result
}

export const platformSettingsServices = {
  createPlatformSettings,
  updatePlatformSettings,
  getPlatformSettings,
}