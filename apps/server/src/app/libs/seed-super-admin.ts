import configs from '@app/configs'
import { AuthRoles, AuthStatus, User, verificationStatus } from '@repo/db'
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
