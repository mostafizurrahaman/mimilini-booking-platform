import { validateRequest } from '@app/middlewares'
import express, { Router } from 'express'
import { AuthValidations } from './user.validations'
import { AuthController } from './user.controllers'
import { auth } from '@app/middlewares/auth'
import { multerFactory } from '@repo/media-hub'

const router: Router = express()

// 1. Sign up route:
router.post(
  '/sign-up',
  multerFactory({
    category: 'image',
    maxSizeInMB: 10,
  }).single('profileImage'),
  validateRequest(AuthValidations.signUserSchema),
  AuthController.signUp
)

// 2. Resend Signup Otp:
router.post(
  '/resend-signup-otp',
  validateRequest(AuthValidations.resendSignupOtpSchema),
  AuthController.resendSignupOTP
)

// 3. Verify signup otp:
router.post(
  '/verify-signup-otp',
  validateRequest(AuthValidations.verifySignupOtpSchema),
  AuthController.verifySignupOTP
)

// 4. Login :
router.post('/login', validateRequest(AuthValidations.loginSchema), AuthController.login)

// 4.1. Login :
router.post(
  '/artist-login',
  validateRequest(AuthValidations.loginSchema),
  AuthController.artistLogin
)
// 4.2. Login :
router.post('/admin-login', validateRequest(AuthValidations.loginSchema), AuthController.adminLogin)

// 5. Forgot password:
router.post(
  '/forgot-password',
  validateRequest(AuthValidations.forgotPasswordSchema),
  AuthController.forgotPassword
)

// 6. Verify reset password otp:
router.post(
  '/verify-otp',
  validateRequest(AuthValidations.verifyResetPasswordOtpSchema),
  AuthController.verifyResetPasswordOtp
)

// 7. Resend reset password otp:
router.post(
  '/resend-otp',
  validateRequest(AuthValidations.resendOTPSchema),
  AuthController.resendOTP
)

// 8. Reset password:
router.post(
  '/reset-password',
  validateRequest(AuthValidations.resetPasswordSchema),
  AuthController.resetPassword
)

// 9. Changed password:
router.post(
  '/changed-password',
  auth(),
  validateRequest(AuthValidations.changedPasswordSchema),
  AuthController.changedPassword
)

// 10. Get me:
router.get('/me', auth(), AuthController.getMe)

// 11. Update profile :
router.patch(
  '/profile',
  auth(),
  multerFactory({
    category: 'image',
    maxSizeInMB: 10,
  }).single('profileImage'),
  validateRequest(AuthValidations.updateProfileSchema),
  AuthController.updateProfile
)

// 12. Change Profile picture:
router.patch(
  '/change-profile',
  multerFactory({
    category: 'image',
    maxSizeInMB: 10,
  }).single('profileImage'),
  auth(),
  AuthController.changeProfilePicture
)

// // 12. Update User Status:
// router.patch(
//   '/update-status/:id',
//   auth(AuthRoles.ADMIN, AuthRoles.SUPER_ADMIN),
//   validateRequest(AuthValidations.updateUserStatusSchema),
//   AuthController.updateUserStatusByID
// )

// 13. Refresh Token:
router.post(
  '/refresh-token',
  validateRequest(AuthValidations.refreshTokenSchema),
  AuthController.refreshToken
)

export const authRoutes = router
