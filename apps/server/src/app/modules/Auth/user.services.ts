/* eslint-disable @typescript-eslint/no-explicit-any */
import { AuthRoles, AuthStatus, Otp, otpTypes, User, verificationStatus, VerificationStatusValues, type IUser } from '@repo/db'
import type {
  IChangedPasswordType,
  IForgotPasswordType,
  ILoginType,
  IResendSignupType,
  IResetPasswordOtpType,
  ISignUpSchemaType,
  IVerifyResetPasswordOtpType,
  IVerifySignupOtpType,
  TUpdateProfilePayloadType,
} from './user.validations'
import {
  addTime,
  AppError,
  comparePassword,
  createToken,
  generateOtp,
  hashPassword,
  verifyToken,
  type IJwtUserPayload,
} from '@repo/shared'
// import { sendEmail } from '@repo/email-sender'
import httpStatus from 'http-status'
import configs from '@app/configs'
import mongoose from 'mongoose'
import { renderEmail, ResetPasswordOTPEmail, SignupOTPEmail } from '@repo/email-templates'
import { sendEmail } from '@repo/email-sender'
import { deleteSingleFileFromS3, uploadSingleFileToS3, type TMulterFile } from '@repo/media-hub'

import { AWS_FOLDER_NAMES } from '@app/libs/files_folder'
import { getNewOtp } from '@app/libs/get-new-otp'
import { logger } from '@app/libs/logger'

// 1. Signup
const signUp = async (payload: ISignUpSchemaType, profileImage: TMulterFile) => {
  const { name, email, password, role } = payload

  // 1. Check existing user
  const existingUser = (await User.isUserExistByEmail(email)) as IUser

  if (existingUser) {
    switch (existingUser.status) {
      case AuthStatus.ACTIVE:
        throw new AppError(
          httpStatus.CONFLICT,
          'An account with this email already exists. Please log in.'
        )

      case AuthStatus.PENDING:{

       const otp = await getNewOtp({
          userId: existingUser._id,
          type: otpTypes.SIGNUP,
        })

        const htmlTemplate = await renderEmail(
          SignupOTPEmail({
            userFirstName: name,
            companyName: configs.site.name,
            companyLogo: configs.site.logo as string,
            otpCode: otp?.otp as string,
            expiresInMin: 1          
          })
        )

        sendEmail({
          to: existingUser.email,
          html: htmlTemplate.html,
          subject: 'Your OTP for Account Verification',
          text: htmlTemplate.text,
        
        })

        //
        return {
          message:
            'A verification code has been sent to your email. Please verify it to complete your signup!',
        
        }
      }

      case AuthStatus.BLOCKED:
        throw new AppError(
          httpStatus.FORBIDDEN,
          'Your account has been blocked. Please contact support.'
        )

      case AuthStatus.DELETED:
        throw new AppError(
          httpStatus.GONE,
          'This account was deleted. Please contact support to restore it.'
        )

      default:
        throw new AppError(httpStatus.CONFLICT, 'You already have an account.')
    }
  }


    let profileImageUrl: string | undefined = undefined

    if (profileImage) { 
      const { url} = await uploadSingleFileToS3(profileImage, AWS_FOLDER_NAMES.ProfileImage)
      profileImageUrl = url
    }



  const mongoSession = await mongoose.startSession()

  try {
    mongoSession.startTransaction()

    // 2. Hash password
    const hashedPassword = await hashPassword(password, configs.passwordSoltRound)

    const isCustomer = role === "customer"

    // 3. Create user (PENDING)
    const [newUser] = await User.create(
      [
        {
          name,
          email,
          passwordHash: hashedPassword,
          status: AuthStatus.PENDING,
          verificationStatus: isCustomer ? verificationStatus.VERIFIED : verificationStatus.PENDING,
          profileImage: profileImageUrl as string, 
          isProfileCompleted: isCustomer, 
          isStripeConnected: false, 
          isOtpVerified: false
        },
      ],
      { session: mongoSession }
    )

    if (!newUser?._id) {
      throw new AppError(httpStatus.BAD_REQUEST, 'User creation failed!')
    }

    const otp = await getNewOtp({
      userId: newUser?._id,
      type: otpTypes.SIGNUP,
      session: mongoSession,
    })

    // 6. Render Signup Template:
    const htmlTemplate = await renderEmail(
      SignupOTPEmail({
        userFirstName: name,
        companyName: configs.site.name,
        companyLogo: configs.site.logo as string,
        otpCode: otp?.otp as string,
        expiresInMin: 1
      })
    )

   
    await mongoSession.commitTransaction()

     // 7. Send OTP with rendered template
    await sendEmail({
      to: newUser.email,
      html: htmlTemplate.html,
      subject: 'Your OTP for Account Verification',
    })   

    return {
      _id: newUser?._id,
      name: newUser.name,
      email: newUser.email,
      password: '',
      status: newUser.status,
      role: newUser.role,
      isTwoFactorEnabled: newUser.isTwoFactorEnabled,
      isOtpVerified: newUser.isOtpVerified,
      createdAt: newUser?.createdAt,
      updatedAt: newUser?.updatedAt,
    }
  } catch (error: any) {
    await mongoSession.abortTransaction()

    if (profileImageUrl){
       await deleteSingleFileFromS3(profileImageUrl)
    }
    
    throw new  error
   } finally{ 
    mongoSession.endSession()
  }
}

// 2. Resend Signup otp:
const resendSignupOTP = async (payload: IResendSignupType) => {
  const { email } = payload

  // 1. Check existing user
  const user = (await User.isUserExistByEmail(email)) as IUser
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, `User Doesn't exits!`)
  }

  if (user.status === AuthStatus.BLOCKED) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      'Your account has been blocked. Please contact support.'
    )
  }

  if (user.status === AuthStatus.DELETED) {
    throw new AppError(
      httpStatus.GONE,
      'This account was deleted. Please contact support to restore it.'
    )
  }

  if (user.isOtpVerified) {
    throw new AppError(httpStatus.CONFLICT, 'Your account already verified!')
  }

  // 2. Get Existing OTP ? :
  const existingOTP = await Otp.findValidOtp(user._id?.toString(), otpTypes.SIGNUP)

  if (existingOTP) {
    const now = new Date().getTime()
    const lastSendedAt = new Date(existingOTP.updatedAt).getTime()
    const twoMinutes = configs.otpSettings.expiresIn * 60 * 1000

    // 3. Check the is OTP trying to send within to 2 minutes ?:
    if (now - lastSendedAt < twoMinutes) {
      const remainingTime = Math.ceil((twoMinutes - (now - lastSendedAt)) / 1000)

      throw new AppError(
        httpStatus.TOO_MANY_REQUESTS,
        `An OTP was already sent. Please wait ${remainingTime} seconds before requesting another one.`
      )
    }
  }

  // 3. Generate the opt:
  const otp = await getNewOtp({
    userId: user?._id?.toString(),
    type: otpTypes.SIGNUP,
  })

  // 4. Signup otp template:
  const htmlTemplate = await renderEmail(
    SignupOTPEmail({
      userFirstName: user.name,
      companyName: configs.site.name,
      companyLogo: configs.site.logo as string,
      otpCode: otp?.otp as string,
      expiresInMin: 1
    })
  )

  // . Send OTP with rendered template
  sendEmail({
    to: user.email,
    html: htmlTemplate.html,
    subject: 'Your New OTP for Account Verification',
    text: htmlTemplate.text,
  })
}

// 3. verify signup otp:
const verifySignupOTP = async (payload: IVerifySignupOtpType) => {
  const { email, otp } = payload

  //  1. check is email exits with this email:
  const user = await User.isUserExistByEmail(email)
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, `User doesn't exists!`)
  }

  // 2. check the status:
  if (user.status === AuthStatus.BLOCKED) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      'Your account has been blocked. Please contact support.'
    )
  }

  if (user.status === AuthStatus.DELETED) {
    throw new AppError(
      httpStatus.GONE,
      'This account was deleted. Please contact support to restore it.'
    )
  }

  // 3. Is already otp verified :
  if (user.isOtpVerified) {
    throw new AppError(httpStatus.BAD_REQUEST, `You account already verified!`)
  }

  // 4. Find valid otp:
  const validOtp = await Otp.verifyAndConsumeOtp(user?._id?.toString(), otpTypes.SIGNUP, otp)

  if (!validOtp) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Invalid otp!')
  }

  user.isOtpVerified = true
  user.status = AuthStatus.ACTIVE
  await user.save()
}

// 4. Login (Customer) :
const login = async (payload: ILoginType) => {
  const { email, password } = payload

  // 1. check user
  const user = await User.findOne({ email }).select('+passwordHash')
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User doesn't exists!")
  }

  if (user.role !== AuthRoles.CUSTOMER) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      'Only customer accounts are permitted to log in through this app.'
    )
  }

  // 2. check user status:
  if (user.status === AuthStatus.BLOCKED) {
    throw new AppError(httpStatus.FORBIDDEN, 'You account is blocked. Please contact support!')
  }

  if (user.status === AuthStatus.DELETED) {
    throw new AppError(httpStatus.GONE, 'Your account is deleted!')
  }

  // 4. check is otp verified ?
  if (!user.isOtpVerified) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Your account is not verified!')
  }

  // 5. compare given password:
  const isPasswordMatched = await comparePassword(password, user.passwordHash)

  if (!isPasswordMatched) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Credential not matched!')
  }

  // 6. Prepare jwt payload:
  const jwtPayload: IJwtUserPayload = {
    _id: user._id?.toString(),
    email: user?.email,
    name: user?.name,
    profileImage: user?.profileImage as string,
    status: user?.status,
  }

  // 7. Generate access token :
  const accessToken = createToken(
    jwtPayload,
    configs.jwt.accessToken.secret,
    configs.jwt.accessToken.expiresIn
  )

  // 8. Generate refresh token
  const refreshToken = createToken(
    jwtPayload,
    configs.jwt.refreshToken.secret,
    configs.jwt.refreshToken.expiresIn
  )

  return {
    refreshToken,
    accessToken,
    isOtpVerified: user.isOtpVerified,
    role: user.role,
    email: user.email,
    isTwoFactorEnabled: user.isTwoFactorEnabled,
  }
}

// 4.1. Login (Customer) :
const artistLogin = async (payload: ILoginType) => {
  const { email, password } = payload

  // 1. check user
  const user = await User.findOne({ email }).select('+passwordHash')
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User doesn't exists!")
  }

  if (user.role !== AuthRoles.ARTIST) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      'Only artist accounts are permitted to log in through this app.'
    )
  }

  // 2. check user status:
  if (user.status === AuthStatus.BLOCKED) {
    throw new AppError(httpStatus.FORBIDDEN, 'You account is blocked. Please contact support!')
  }

  if (user.status === AuthStatus.DELETED) {
    throw new AppError(httpStatus.GONE, 'Your account is deleted!')
  }

  // 3. check is otp verified ?
  if (!user.isOtpVerified) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Your account is not verified!')
  }
  
  // 5. compare given password:
  const isPasswordMatched = await comparePassword(password, user.passwordHash)

  if (!isPasswordMatched) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Credential not matched!')
  }

  // 6. Prepare jwt payload:
  const jwtPayload: IJwtUserPayload = {
    _id: user._id?.toString(),
    email: user?.email,
    name: user?.name,
    profileImage: user?.profileImage as string,
    status: user?.status,
  }

  // 7. Generate access token :
  const accessToken = createToken(
    jwtPayload,
    configs.jwt.accessToken.secret,
    configs.jwt.accessToken.expiresIn
  )

  // 8. Generate refresh token
  const refreshToken = createToken(
    jwtPayload,
    configs.jwt.refreshToken.secret,
    configs.jwt.refreshToken.expiresIn
  )


  // ?? Write messages here: 
  const message = user?.isProfileCompleted ? `You are logged in successfully. Please complete your profile.` :  "You are logged in successfully."

  return {
    message,
    refreshToken,
    accessToken,
    isProfileCompleted: user.isProfileCompleted,
    isOtpVerified: user.isOtpVerified,
    role: user.role,
    email: user.email,
    isTwoFactorEnabled: user.isTwoFactorEnabled,
  }
}

// 4.1. Login :
const adminLogin = async (payload: ILoginType) => {
  const { email, password } = payload

  // 1. check user
  const user = await User.findOne({ email }).select('+passwordHash')
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User doesn't exists!")
  }

  if (user.role === AuthRoles.CUSTOMER || user.role === AuthRoles.ARTIST) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      'You are not authorized to log in through this portal.'
    )
  }

  // 2. check user status:
  if (user.status === AuthStatus.BLOCKED) {
    throw new AppError(httpStatus.FORBIDDEN, 'You account is blocked. Please contact support!')
  }

  if (user.status === AuthStatus.DELETED) {
    throw new AppError(httpStatus.GONE, 'Your account is deleted!')
  }


  // 4. check is otp verified ?
  if (!user.isOtpVerified) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Your account is not verified!')
  }

  // 5. compare given password:
  const isPasswordMatched = await comparePassword(password, user.passwordHash)

  if (!isPasswordMatched) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Credential not matched!')
  }

  // 6. Prepare jwt payload:
  const jwtPayload: IJwtUserPayload = {
    _id: user._id?.toString(),
    email: user?.email,
    name: user?.name,
    profileImage: user?.profileImage as string,
    status: user?.status,
  }

  // 7. Generate access token :
  const accessToken = createToken(
    jwtPayload,
    configs.jwt.accessToken.secret,
    configs.jwt.accessToken.expiresIn
  )

  // 8. Generate refresh token
  const refreshToken = createToken(
    jwtPayload,
    configs.jwt.refreshToken.secret,
    configs.jwt.refreshToken.expiresIn
  )

  return {
    refreshToken,
    accessToken,
    role: user.role,
    email: user.email,
    isTwoFactorEnabled: user.isTwoFactorEnabled,
  }
}

// 5. Forgot password
const forgotPassword = async (payload: IForgotPasswordType) => {
  const { email } = payload
  // 1. check user
  const user = await User.findOne({ email })
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User doesn't exists!")
  }

  // 2. check user status:
  if (user.status === AuthStatus.BLOCKED) {
    throw new AppError(httpStatus.FORBIDDEN, 'You account is blocked. Please contact support!')
  }

  if (user.status === AuthStatus.DELETED) {
    throw new AppError(httpStatus.GONE, 'Your account is deleted!')
  }

  // 3. check is otp verified ?
  if (!user.isOtpVerified) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Your account is not verified!')
  }

  // 4. Generate new otp
  const newOtp = generateOtp({
    length: configs.otpSettings.digits,
  })

  // 9. Store reset password otp:
  const otp = await Otp.findOneAndUpdate(
    {
      user: user?._id?.toString(),
      type: otpTypes.RESET,
    },
    {
      user: user?._id?.toString(),
      type: otpTypes.RESET,
      expiresAt: addTime(configs.otpSettings.expiresIn, 'minutes'),
      otp: newOtp,
    },
    {
      new: true,
      upsert: true,
    }
  )

  // 6. Render Reset password otp template:
  const htmlTemplate = await renderEmail(
    ResetPasswordOTPEmail({
      userFirstName: user.name,
      userEmail: user?.email,
      companyName: configs.site.name,
      companyLogo: configs.site.logo as string,
      otpCode: otp?.otp as string,
      expirationMinutes: 1
    })
  )

  // 7. Send OTP with rendered template
  sendEmail({
    to: user.email,
    html: htmlTemplate.html,
    subject: 'OTP for reset password!',
    text: htmlTemplate.text,
  })
}

// 6. Verify Reset password otp:
const verifyResetPasswordOtp = async (payload: IVerifyResetPasswordOtpType) => {
  const { email, otp } = payload

  // 1. check user
  const user = await User.findOne({ email })
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User doesn't exists!")
  }

  // 2. check user status:
  if (user.status === AuthStatus.BLOCKED) {
    throw new AppError(httpStatus.FORBIDDEN, 'You account is blocked. Please contact support!')
  }

  if (user.status === AuthStatus.DELETED) {
    throw new AppError(httpStatus.GONE, 'Your account is deleted!')
  }

  // 3. check is otp verified ?
  if (!user.isOtpVerified) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Your account is not verified!')
  }

  // 4. Find valid otp:
  const validOtp = await Otp.verifyAndConsumeOtp(user?._id?.toString(), otpTypes.RESET, otp)

  if (!validOtp) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Invalid otp!')
  }

  // 5. Reset token payload:
  const resetTokenPayload = {
    _id: user?._id?.toString(),
    email: user.email,
    name: user.name,
    profileImage: user.profileImage as string,
    status: user.status,
  }

  // 5. Reset password token:
  const resetToken = createToken(
    resetTokenPayload,
    configs.jwt.resetToken.secret,
    configs.jwt.resetToken.expiresIn
  )

  return {
    resetToken,
  }
}

// 7. Resend Signup otp:
const resendOTP = async (payload: IResendSignupType) => {
  const { email } = payload

  // 1. Check existing user
  const user = (await User.isUserExistByEmail(email)) as IUser
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, `User Doesn't exits!`)
  }

  if (user.status === AuthStatus.BLOCKED) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      'Your account has been blocked. Please contact support.'
    )
  }

  if (user.status === AuthStatus.DELETED) {
    throw new AppError(
      httpStatus.GONE,
      'This account was deleted. Please contact support to restore it.'
    )
  }

  if (!user.isOtpVerified) {
    throw new AppError(httpStatus.CONFLICT, 'Your account is not verified yet!')
  }

  // 2. Check Otp exists ? :
  const existingOTP = await Otp.findValidOtp(user._id?.toString(), otpTypes.RESET)

  // 3. If existing otp still valid resend otp:
  if (existingOTP) {
    const now = new Date().getTime()
    const lastSendedAt = new Date(existingOTP.updatedAt).getTime()
    const twoMinutes = configs.otpSettings.expiresIn * 60 * 1000

    // 4. Check the is OTP trying to send within to 2 minutes ?:
    if (now - lastSendedAt < twoMinutes) {
      const remainingTime = Math.ceil((twoMinutes - (now - lastSendedAt)) / 1000)

      throw new AppError(
        httpStatus.TOO_MANY_REQUESTS,
        `An OTP was already sent. Please wait ${remainingTime} seconds before requesting another one.`
      )
    }
  }

  // 5. Generate new otp:
  const newOtp = await getNewOtp({
    userId: user?._id?.toString(),
    type: otpTypes.RESET,
  })

  // 6. Render Signup Template:
  const htmlTemplate = await renderEmail(
    ResetPasswordOTPEmail({
      userFirstName: user.name,
      userEmail: user?.email,
      companyName: configs.site.name,
      companyLogo: configs.site.logo as string,
      otpCode: newOtp?.otp as string,
      expirationMinutes: 1
    })
  )

  // 7. Send OTP with rendered template
  sendEmail({
    to: user.email,
    html: htmlTemplate.html,
    subject: 'OTP for reset password!',
    text: htmlTemplate.text,
  })

  return {
    generated: true,
  }
}

// 8. Reset password :
const resetPassword = async (resetToken: string, payload: IResetPasswordOtpType) => {
  const { newPassword } = payload

  // 1. Decode the reset token:
  const decoded = verifyToken(resetToken, configs.jwt.resetToken.secret)
  if (!decoded.email) {
    throw new AppError(httpStatus.FORBIDDEN, 'Invalid Token!')
  }

  // 2. Find user with this email:
  const user = await User.findOne({ email: decoded.email }).select('+password')
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User doesn't exits!")
  }

  // 3. Check user status :
  if (user.status === AuthStatus.BLOCKED) {
    throw new AppError(httpStatus.FORBIDDEN, 'You account is blocked. Please contact support!')
  }

  if (user.status === AuthStatus.DELETED) {
    throw new AppError(httpStatus.GONE, 'Your account is deleted!')
  }

  // 4. Compare if JWT was issued before password change:
  if (
    await User.isJwtIssuedBeforePasswordChanged(
      user.passwordChangedAt as Date,
      decoded.iat as number
    )
  ) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Your session has expired.')
  }

  // 4. Hash password:
  const hashedPassword = await hashPassword(newPassword, configs.passwordSoltRound)

  // 5. Update user password:
  await User.findOneAndUpdate(
    {
      _id: user?._id,
    },
    {
      $set: {
        passwordHash: hashedPassword,
        passwordChangedAt: new Date(),
      },
    }
  )

  return
}

// 9. Changed password:
const changedPassword = async (userInfo: IUser, payload: IChangedPasswordType) => {
  const { newPassword, oldPassword } = payload

  // 1. Check is user exists with this id?:
  const user = await User.findById(userInfo._id).select('+passwordHash')
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User doesn't exists!")
  }

  // 2. Compare old password to password hash:
  const isPasswordMatched = await comparePassword(oldPassword, user.passwordHash)
  if (!isPasswordMatched) {
    throw new AppError(httpStatus.CONFLICT, 'Password not matched!')
  }

  // 3. Hash new password:
  const hashedPassword = await hashPassword(newPassword, configs.passwordSoltRound)

  // 4. Update password now:
  await User.findOneAndUpdate(
    {
      _id: user._id,
    },
    {
      password: hashedPassword,
      passwordChangedAt: new Date(),
    },
    {
      new: true,
    }
  )
}

// 10. Get me :
const getMe = async (user: IUser) => {
  const profile = await User.aggregate([
    {
      $match: {
        _id: user?._id,
      },
    },
    {
      $project: {
        _id: '$_id',
        name: '$name',
        email: '$email',
        phone: { $ifNull: ['$phone', null] },
        status: '$status',
        verificationStatus: "$verificationStatus",
        role: '$role',
        profileImage: { $ifNull: ['$profileImage', null] },
        isProfileCompleted: { $ifNull: ['$isProfileCompleted', null] },
        isStripeConnected: { $ifNull: ['$isStripeConnected', null] },
        createdAt: '$createdAt',
        updatedAt: '$updatedAt',
      },
    },
  ])

  if (!profile?.[0]) {
    throw new AppError(httpStatus.NOT_FOUND, 'Profile not found!')
  }

  return profile?.[0]
}

// 11. Update Profile:
const updateProfile = async (
  user: IUser,
  payload: TUpdateProfilePayloadType,
  profileImageFile: TMulterFile
) => {
  const { name,  phone } = payload

  const oldImageUrl = user?.profileImage
  let newImageUrl = undefined
  // if the profile file provided:

  if (profileImageFile) {
    const { url } = await uploadSingleFileToS3(profileImageFile, AWS_FOLDER_NAMES.ProfileImage)

    user.profileImage = url
    newImageUrl = url
  }

  if (name !== undefined) user.name = name
  if (phone !== undefined) user.phone = phone

  try {
    await user.save({
      validateBeforeSave: true,
    })
  } catch (error) {
    logger.info('Update profile error', error)
    await deleteSingleFileFromS3(newImageUrl as string)
    throw new AppError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to update profile')
  }

  if (oldImageUrl && newImageUrl) {
    await deleteSingleFileFromS3(oldImageUrl!)
  }

  return {
    name: user.name,
    email: user.email,
    phone: user.phone || null,
    profileImageFile: user.profileImage || null,
    createdAt: user.createdAt,
    updated: user.updatedAt,
  }
}

// 12. Update Profile:
const changeProfilePicture = async (
  user: IUser,
  profileImageFile: TMulterFile
) => {


  const oldImageUrl = user?.profileImage
  let newImageUrl = undefined
  // if the profile file provided:

  if (profileImageFile) {
    const { url } = await uploadSingleFileToS3(profileImageFile, AWS_FOLDER_NAMES.ProfileImage)

    user.profileImage = url
    newImageUrl = url
  }

  

  try {
    await user.save({
      validateBeforeSave: true,
    })
  } catch (error) {
    await deleteSingleFileFromS3(newImageUrl as string)
    throw  error
  }

  if (oldImageUrl && newImageUrl) {
    await deleteSingleFileFromS3(oldImageUrl!)
  }

  return {
    name: user.name,
    email: user.email,
    phone: user.phone || null,
    profileImageFile: user.profileImage || null,
    createdAt: user.createdAt,
    updated: user.updatedAt,
  }
}

// 12. Change account status:
const updateUserStatusIntoDB = async (
  user: IUser,
  targetUserId: string,
  payload: IUpdateUserStatusPayload
) => {
  const { status, reason } = payload

  // ? Check is targeted user exists :
  const targetUser = await User.findOne({
    _id: targetUserId,
  })

  if (!targetUser) {
    throw new AppError(httpStatus.NOT_FOUND, "User doesn't exists.")
  }

  if (targetUser?._id?.toString() === user?._id?.toString()) {
    throw new AppError(httpStatus.BAD_REQUEST, 'You cannot change your own status.')
  }

  if (!targetUser.isOtpVerified) {
    throw new AppError(httpStatus.NOT_FOUND, 'User account is not verified yet.')
  }

  // Now Check the permission :
  const actorUserPermission = AuthPermission[user?.role] as number
  const targetUserPermission = AuthPermission[targetUser?.role] as number

  if (actorUserPermission <= targetUserPermission) {
    throw new AppError(httpStatus.FORBIDDEN, "You don't have enough permission to change status!")
  }

  if (actorUserPermission === undefined || targetUserPermission === undefined) {
    throw new AppError(httpStatus.INTERNAL_SERVER_ERROR, 'Invalid role permission configuration.')
  }

  if (targetUser.status === status) {
    throw new AppError(httpStatus.BAD_REQUEST, `The user's status is already set to ${status}.`)
  }

  targetUser.status = status

  if (targetUser.status === AuthStatus.BLOCKED) {
    if (!reason) {
      throw new AppError(httpStatus.BAD_REQUEST, 'A reason is required when blocking a user.')
    }
    targetUser.blockedReason = reason as string
    targetUser.blockedAt = new Date()
  } else {
    targetUser.blockedReason = undefined
    targetUser.blockedAt = undefined
  }

  await targetUser.save({
    validateBeforeSave: true,
  })

  return null
}

// 13. Refresh token:
const refreshToken = async (token: string) => {
  if (!token) {
    throw new AppError(httpStatus.UNAUTHORIZED, 'Token is required!')
  }

  // Validates signature and expiration
  const decodedData = verifyToken(token, configs.jwt.refreshToken.secret!) as IJwtUserPayload

  if (!decodedData._id || !decodedData.iat) {
    throw new AppError(httpStatus.UNAUTHORIZED, 'Invalid refresh token.')
  }

  const user = await User.findById(decodedData._id)

  if (!user) {
    throw new AppError(
      httpStatus.UNAUTHORIZED,
      'The account associated with this token no longer exists.'
    )
  }

  if (!user.isOtpVerified) {
    throw new AppError(httpStatus.UNAUTHORIZED, 'Your account has not been verified.')
  }

  if (user.status !== AuthStatus.ACTIVE) {
    throw new AppError(
      httpStatus.UNAUTHORIZED,
      `Your account is currently ${user.status.toLowerCase()}.`
    )
  }

  if (user.passwordChangedAt) {
    const isTokenStale = await User.isJwtIssuedBeforePasswordChanged(
      user.passwordChangedAt,
      decodedData.iat
    )

    if (isTokenStale) {
      throw new AppError(httpStatus.UNAUTHORIZED, 'Your session has expired. Please log in again.')
    }
  }

  const jwtPayload: IJwtUserPayload = {
    _id: user._id.toString(),
    email: user.email,
    name: user.name,
    role: user.role,
    profileImage: user.profileImage!,
    status: user.status,
  }

  const accessToken = createToken(
    jwtPayload,
    configs.jwt.accessToken.secret!,
    configs.jwt.accessToken.expiresIn!
  )

  return {
    accessToken,
  }
}

export const AuthServices = {
  signUp,
  resendSignupOTP,
  verifySignupOTP,
  login,
  artistLogin,
  adminLogin,
  forgotPassword,
  verifyResetPasswordOtp,
  resendOTP,
  resetPassword,
  changedPassword,
  getMe,
  updateProfile,
  changeProfilePicture,
  updateUserStatusIntoDB,
  refreshToken,
}
