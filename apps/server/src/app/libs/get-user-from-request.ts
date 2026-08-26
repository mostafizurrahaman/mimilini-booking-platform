import type { Request } from 'express'
import { User, type IUser } from '@repo/db'
import { AppError } from '@repo/shared'
import httpStatus from 'http-status'

export const getUserFromRequest = async (req: Request): Promise<IUser> => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const user = (req as any).user
  const userInfo = await User.findById(user?._id)
  if (!userInfo) {
    throw new AppError(httpStatus.NOT_FOUND, "User doesn't exists")
  }
  return userInfo as IUser
}
