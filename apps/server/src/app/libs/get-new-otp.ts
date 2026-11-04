import { Types, type ClientSession } from 'mongoose'
import { Otp, type IOtpDocument, type IOtpType } from '@repo/db'
import { addTime, AppError, generateOtp } from '@repo/shared'
import httpStatus from 'http-status'
import configs from '@app/configs'

interface IGetOrCreateOtpOptions {
  userId: Types.ObjectId | string
  type: IOtpType
  session?: ClientSession
  checkCooldown?: boolean
  cooldownSeconds?: number
}

export const getNewOtp = async ({
  userId,
  type,
  session,
  checkCooldown = false,
  cooldownSeconds = configs.otpSettings.cooldownSeconds || 60,
}: IGetOrCreateOtpOptions): Promise<IOtpDocument> => {
  const normalizedUserId = userId.toString()

  if (checkCooldown) {
    const existingOtp = await Otp.findOne({
      user: normalizedUserId,
      type,
    })

    if (existingOtp) {
      const now = Date.now()
      const lastSentAt = new Date(existingOtp.updatedAt || existingOtp.createdAt).getTime()
      const cooldownMs = cooldownSeconds * 1000
      const elapsed = now - lastSentAt

      if (elapsed < cooldownMs) {
        const remainingSeconds = Math.ceil((cooldownMs - elapsed) / 1000)
        throw new AppError(
          httpStatus.TOO_MANY_REQUESTS,
          `An OTP was already sent. Please wait ${remainingSeconds} seconds before requesting another one.`
        )
      }
    }
  }

  const otp = generateOtp({
    length: configs.otpSettings.digits,
  })

  const expiresInMinutes = configs.otpSettings.expiresIn || 5
  const expiresAt = addTime(expiresInMinutes, 'minutes', true)

  /*
   * Replace the previous OTP for this user and type,
   * or create one when it does not exist.
   */
  const savedOtp = await Otp.findOneAndUpdate(
    {
      user: normalizedUserId,
      type,
    },
    {
      $set: {
        user: normalizedUserId,
        type,
        otp,
        expiresAt,
        updatedAt: new Date(),
      },
    },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
      ...(session && { session }),
    }
  )

  if (!savedOtp) {
    throw new Error('Failed to generate OTP')
  }

  return savedOtp
}
