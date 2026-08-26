import { Document, Model } from 'mongoose'
import type { TAuthRole, TAuthStatus, TVerificationStatus } from './user.constant'

export interface IUser extends Document {
  name: string
  email: string
  
  passwordHash: string
  status: TAuthStatus
  verificationStatus: TVerificationStatus

  // roles:
  role: TAuthRole

  // profile common properties:
  profileImage?: string
  phone?: string

  // 2FA:
  twoFactorSecret?: string
  isTwoFactorEnabled: boolean
  twoFactorBackupCodes?: string[]
  isOtpVerified: boolean
  isProfileCompleted: boolean

  // Stripe related:
  isStripeConnected: boolean

  // reason:
  blockedReason?: string
  deletionReason?: string
  rejectionReason?: string; 

  // common timestamps:
  lastLogin?: Date
  lastActivity?: Date
  blockedAt?: Date
  deletedAt?: Date
  passwordChangedAt?: Date
  createdAt: Date
  updatedAt: Date
}

export interface IUserDoc  extends IUser, Document { }

export interface IUserModel extends Model<IUserDoc> {
  getUserById(id: string): Promise<IUserDoc | null>
  isUserExistByEmail(email: string): Promise<IUserDoc | null>
  isJwtIssuedBeforePasswordChanged: (
    passwordChangedAt: Date,
    jwtIssuedTimestamps: number
  ) => Promise<boolean>
}
