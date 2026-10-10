import {
  PlatformSettings,
  DEFAULT_PLATFORM_SETTINGS,
  PLATFORM_SETTINGS_SINGLETON_KEY,
  type IUser,
} from '@repo/db'
import httpStatus from 'http-status'
import { AppError } from '@repo/shared'
import type {
  TCreatePlatformSettingsPayloadType,
  TUpdatePlatformSettingsPayloadType,
} from './platform-settings.validations'

/**
 * 1. Create / Upsert Global Platform Settings
 * Edge Case: Platform settings is global and only one platform settings document exists.
 * If one already exists, this updates the singleton document rather than creating a duplicate.
 */
const createPlatformSettings = async (
  user: IUser,
  payload: TCreatePlatformSettingsPayloadType
) => {
  const existingSettings = await PlatformSettings.findOne()

  if (existingSettings) {
    return await updatePlatformSettings(user, payload)
  }

  const result = await PlatformSettings.create({
    ...payload,
    singletonKey: PLATFORM_SETTINGS_SINGLETON_KEY,
    updatedBy: user._id,
  })

  return await PlatformSettings.findById(result._id).populate(
    'updatedBy',
    'name email role'
  )
}

/**
 * 2. Update Global Platform Settings
 * Edge Cases:
 * - Operates purely on the single global platform settings document (no ID required)
 * - Automatically initializes with defaults if no settings exist yet
 * - Validates mediumMaxAmount > lowMaxAmount against DB state
 * - Flattens nested low/medium/high subdocuments to avoid erasing sibling fee fields
 */
const updatePlatformSettings = async (
  user: IUser,
  payload: TUpdatePlatformSettingsPayloadType
) => {
  let existingSettings = await PlatformSettings.findOne()

  if (!existingSettings) {
    existingSettings = await PlatformSettings.create({
      ...DEFAULT_PLATFORM_SETTINGS,
      singletonKey: PLATFORM_SETTINGS_SINGLETON_KEY,
      updatedBy: user._id,
    })
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
    singletonKey: PLATFORM_SETTINGS_SINGLETON_KEY,
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
 * 3. Get Global Platform Settings
 * Edge Cases:
 * - Returns the single global platform settings document
 * - Initializes with default platform settings if not yet seeded
 * - Populates admin who last updated settings
 */
const getPlatformSettings = async () => {
  let result = await PlatformSettings.findOne().populate(
    'updatedBy',
    'name email role'
  )

  if (!result) {
    result = await PlatformSettings.create({
      ...DEFAULT_PLATFORM_SETTINGS,
      singletonKey: PLATFORM_SETTINGS_SINGLETON_KEY,
    })
  }

  return result
}

export const platformSettingsServices = {
  createPlatformSettings,
  updatePlatformSettings,
  getPlatformSettings,
}