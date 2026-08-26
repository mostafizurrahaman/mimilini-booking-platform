import { AppError, catchAsync, verifyToken } from '@repo/shared'
import {  AuthStatus, User, type TAuthRole } from '@repo/db'
import httpStatus from 'http-status'
import configs from '@app/configs'

export const auth = (...requiredRoles: TAuthRole[]) => {
  return catchAsync(async (req, res, next) => {
    /**
     * 1. Extract access token
     */
    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      throw new AppError(httpStatus.UNAUTHORIZED, 'Authorization token is missing')
    }

    const token = authHeader.split(' ')[1]

    /**
     * 2. Verify and decode token
     */
    const decoded = verifyToken(token as string, configs.jwt.accessToken.secret)

    if (!decoded?.email) {
      throw new AppError(httpStatus.UNAUTHORIZED, 'Invalid access token')
    }

    /**
     * 3. Fetch user
     */
    const user = await User.isUserExistByEmail(decoded.email)
    if (!user) {
      throw new AppError(httpStatus.NOT_FOUND, 'User not found')
    }

    /**
     * 4. Account status checks
     */
    if (user.status === AuthStatus.BLOCKED) {
      throw new AppError(httpStatus.FORBIDDEN, 'Your account has been blocked')
    }

    if (user.status === AuthStatus.DELETED) {
      throw new AppError(httpStatus.GONE, 'Your account has been deleted')
    }

    if (!user.isOtpVerified) {
      throw new AppError(httpStatus.FORBIDDEN, 'Please verify your account')
    }

  
    if (user.status !== AuthStatus.ACTIVE) {
      throw new AppError(httpStatus.FORBIDDEN, 'Your account is not active')
    }


    // ?? TODO: Write the logic for verification status for artist user: 

    /**
     * 5. Token invalidation check
     */
    if (
      user.passwordChangedAt &&
      (await User.isJwtIssuedBeforePasswordChanged(user.passwordChangedAt, decoded.iat as number))
    ) {
      throw new AppError(httpStatus.UNAUTHORIZED, 'Token has expired. Please log in again')
    }

    /**
     * 6. Role-based access control (RBAC)
     */
    if (requiredRoles.length && !requiredRoles.includes(user.role)) {
      throw new AppError(httpStatus.FORBIDDEN, 'You do not have permission to access this resource')
    }

    /**
     * 7. Attach user to request
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(req as any).user = decoded

    next()
  })
}
