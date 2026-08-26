import { catchAsync,  sendResponse, setCookie } from '@repo/shared'
import { AuthServices } from './user.services'
import httpStatus from 'http-status'
import configs from '@app/configs'
import type { TMulterFile } from '@repo/media-hub'
import { getUserFromRequest } from '@app/libs/get-user-from-request'

// 1. Sign up
const signUp = catchAsync(async (req, res) => {
  const profileImage = req.file as TMulterFile
  const result = await AuthServices.signUp(req.body, profileImage)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.CREATED,
    message: result.message ?? `User signed up successfully!`,
    data: null,
  })
})

// 2. Resend Signup otp :
const resendSignupOTP = catchAsync(async (req, res) => {
  const result = await AuthServices.resendSignupOTP(req.body)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: `A new OTP has been sent to your email.`,
    data: result,
  })
})

// 3. Verify signup otp:
const verifySignupOTP = catchAsync(async (req, res) => {
  await AuthServices.verifySignupOTP(req.body)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: `OTP verified successfully!`,
    data: null,
  })
})

// 4. Login user:
const login = catchAsync(async (req, res) => {
  const result = await AuthServices.login(req.body)

  setCookie(res, 'refreshToken', result.refreshToken, {
    httpOnly: true,
    secure: configs.nodeEnv === 'production',
    maxAge: 365 * 24 * 60 * 60 * 1000, // 365 days
    sameSite: 'lax',
    path: '/',
  })

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: `You have logged in successfully!`,
    data: result,
  })

})

// 4.1. Artist Login: 
const artistLogin = catchAsync(async (req, res) => {
  const result = await AuthServices.artistLogin(req.body)

  setCookie(res, 'refreshToken', result.refreshToken, {
    httpOnly: true,
    secure: configs.nodeEnv === 'production',
    maxAge: 365 * 24 * 60 * 60 * 1000, // 365 days
    sameSite: 'lax',
    path: '/',
  })

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: result?.message ?? "You have logged in successfully",
    data: result,
  })
})


// 4.2. Admin Login 
const adminLogin = catchAsync(async (req, res) => {
  const result = await AuthServices.adminLogin(req.body)

  setCookie(res, 'refreshToken', result.refreshToken, {
    httpOnly: true,
    secure: configs.nodeEnv === 'production',
    maxAge: 365 * 24 * 60 * 60 * 1000, // 365 days
    sameSite: 'lax',
    path: '/',
  })

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: `You have logged in successfully!`,
    data: result,
  })
})

// 5. Forgot password:
const forgotPassword = catchAsync(async (req, res) => {
  const result = await AuthServices.forgotPassword(req.body)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: `Forgot password OTP sent to you email!`,
    data: result,
  })
})

// 6. Verify reset password:
const verifyResetPasswordOtp = catchAsync(async (req, res) => {
  const result = await AuthServices.verifyResetPasswordOtp(req.body)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: `Otp successfully verified!`,
    data: result,
  })
})
// 7. Resend Forgot Password OTP:
const resendOTP = catchAsync(async (req, res) => {
  const result = await AuthServices.resendOTP(req.body)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: `OTP resend successfully!`,
    data: result,
  })
})

// 8. Verify reset password:
const resetPassword = catchAsync(async (req, res) => {
  const resetToken = req.query.resetToken as string
  const payload = req.body

  await AuthServices.resetPassword(resetToken, payload)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: `Password changed successfully!`,
    data: null,
  })
})

// 9. Changed password:
const changedPassword = catchAsync(async (req, res) => {
  const payload = req.body
  const user = await getUserFromRequest(req)

  await AuthServices.changedPassword(user, payload)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: `Password changed successfully!`,
    data: null,
  })
})



const getMe = catchAsync(async (req, res) => {
  const user = await getUserFromRequest(req)

  const result = await AuthServices.getMe(user)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: `Profile retrieved successfully !`,
    data: result,
  })
})

const updateProfile = catchAsync(async (req, res) => {
  const payload = req.body
  const user = await getUserFromRequest(req)
  const profileFile = req.file as TMulterFile

  const result = await AuthServices.updateProfile(user, payload, profileFile)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: `Profile updated successfully!`,
    data: result,
  })
})
const changeProfilePicture = catchAsync(async (req, res) => {
    const user = await getUserFromRequest(req)
  const profileFile = req.file as TMulterFile

  const result = await AuthServices.changeProfilePicture(user,  profileFile)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: `Profile picture has changed successfully!`,
    data: result,
  })
})

const updateUserStatusByID = catchAsync(async (req, res) => {
  const payload = req.body
  const user = await getUserFromRequest(req)
  const targetUserId = req.params.id as string

  const result = await AuthServices.updateUserStatusIntoDB(user, targetUserId, payload)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: `User status updated successfully!`,
    data: result,
  })
})

const refreshToken = catchAsync(async (req, res) => {
  const token = req.cookies?.refreshToken || req.body?.refreshToken 

  const result = await AuthServices.refreshToken(token)

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: `A new access token generated successfully.`,
    data: result,
  })
})




export const AuthController = {
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
  refreshToken,
  updateUserStatusByID


}
