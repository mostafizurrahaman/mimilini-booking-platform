import { Types, type ClientSession } from 'mongoose'
import { Otp, type IOtpDocument, type IOtpType } from '@repo/db'
import { addTime, generateOtp } from '@repo/shared'
import configs from '@app/configs'

interface IGetOrCreateOtpOptions {
  userId: Types.ObjectId | string
  type: IOtpType
  session?: ClientSession
}

export const getNewOtp = async ({
  userId,
  type,
  session,
}: IGetOrCreateOtpOptions): Promise<IOtpDocument> => {
  const normalizedUserId = userId.toString()

  const otp = generateOtp({
    length: configs.otpSettings.digits,
  })

  const expiresAt = addTime(configs.otpSettings.expiresIn, 'minutes', true)

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
      },
    },
    {
      new: true,
      upsert: true,
      ...(session && { session }),
    }
  )

  if (!savedOtp) {
    throw new Error('Failed to generate OTP')
  }

  return savedOtp
}
