import configs from '@app/configs'
import {
  AuthRoles,
  AuthStatus,
  User,
  verificationStatus,
  PlatformSettings,
  DEFAULT_PLATFORM_SETTINGS,
  PLATFORM_SETTINGS_SINGLETON_KEY,
} from '@repo/db'
import { hashPassword } from '@repo/shared'

import { logger } from './logger'

export const seedSuperAdmin = async () => {
  const payload = {
    name: 'Mimilini Super Admin',
    email: configs.superAdmin.email,
    phone: configs.superAdmin.phone,
    passwordHash: await hashPassword(configs.superAdmin.password, configs.passwordSoltRound),
    role: AuthRoles.SUPER_ADMIN,
    status: AuthStatus.ACTIVE,
    verificationStatus: verificationStatus.VERIFIED,
    profileImage: '',
    isProfile: true,
    isOtpVerified: true,
  }

  // Ensure PlatformSettings exist and sync latest cancellation fee tiers in DB
  try {
    const existingSettings = await PlatformSettings.findOne()
    if (!existingSettings) {
      await PlatformSettings.create({
        ...DEFAULT_PLATFORM_SETTINGS,
        singletonKey: PLATFORM_SETTINGS_SINGLETON_KEY,
      })
      logger.info('Initialized PlatformSettings with latest defaults.')
    } else {
      await PlatformSettings.updateOne(
        { _id: existingSettings._id },
        {
          $set: {
            lowMaxAmount: DEFAULT_PLATFORM_SETTINGS.lowMaxAmount,
            mediumMaxAmount: DEFAULT_PLATFORM_SETTINGS.mediumMaxAmount,
            low: DEFAULT_PLATFORM_SETTINGS.low,
            medium: DEFAULT_PLATFORM_SETTINGS.medium,
            high: DEFAULT_PLATFORM_SETTINGS.high,
          },
        }
      )
      logger.info('Synchronized PlatformSettings cancellation fee tiers to database.')
    }
  } catch (settingsError) {
    logger.warn('Failed to sync PlatformSettings on startup:', settingsError)
  }

  const user = await User.findOne({ email: configs.superAdmin.email })
  try {
    if (user) {
      logger.debug('Super admin already exists. Skipping creation...')
      return
    }

    await User.create(payload)
    logger.info('Super admin created successfully')
  } catch (error) {
    logger.error('Error creating super admin:', error)
  }
}
