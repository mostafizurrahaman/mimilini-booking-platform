import { AppError, catchAsync, verifyToken } from '@repo/shared'
import { AuthRoles, AuthStatus, User, type IUser, type TAuthRole } from '@repo/db'
import httpStatus from 'http-status'
import configs from '@app/configs'
import type { Request } from 'express'

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

    if (requiredRoles.length && !requiredRoles.includes(user.role)) {
      /**
       * 7. Role-based access control (RBAC)
       */
      throw new AppError(httpStatus.FORBIDDEN, 'You do not have permission to access this resource')
    }

    checkArtistPermission(user, req)

    /**
     * 8. Attach user to request
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(req as any).user = decoded

    next()
  })
}

const checkArtistPermission = (user: IUser, req: Request) => {
  //  7. Artist Access Control (Onboarding & Verification)

  if (user.role === AuthRoles.ARTIST) {
    const limitedAccessRoutes = [
      { method: 'GET', route: '/api/v1/auth/me' },
      { method: 'POST', route: '/api/v1/artist' }, // Onboarding submit
      { method: 'PATCH', route: '/api/v1/artist/resubmit' }, // Resubmit docs
      { method: 'GET', route: '/api/v1/artist/verification-status' },
      {
        method: 'PATCH',
        route: '/api/artist',
      },
    ]

    const isAllowed = limitedAccessRoutes.some(
      (item) => item.method === req.method && req.originalUrl.startsWith(item.route)
    )

    // Check is profile in completed ?:
    if (!user.isProfileCompleted) {
      if (!isAllowed) {
        throw new AppError(
          httpStatus.FORBIDDEN,
          'Profile incomplete. Please complete your registration and upload documents.'
        )
      }
      return
    }

    switch (user.verificationStatus) {
      case 'in_review':
        if (!isAllowed) {
          throw new AppError(
            httpStatus.FORBIDDEN,
            'Your documents are under review. Full access will be granted after admin approval.'
          )
        }
        break

      case 'rejected':
        if (!isAllowed) {
          throw new AppError(
            httpStatus.FORBIDDEN,
            'Your verification was rejected. Please check the reason and resubmit documents.'
          )
        }
        break

      case 'pending':
        if (!isAllowed) {
          throw new AppError(httpStatus.FORBIDDEN, 'Please submit your documents for verification.')
        }
        break

      case 'verified':
        break

      default:
        throw new AppError(httpStatus.FORBIDDEN, 'Unauthorized access.')
    }
  }
}
