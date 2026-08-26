import { model, Schema } from 'mongoose'

import { AuthRoles, AuthStatus, verificationStatus, VerificationStatusValues } from './user.constant'
import type { IUser, IUserDoc, IUserModel } from './user.interface'

const userSchema = new Schema<IUserDoc, IUserModel>(
  {
    name: {
      type: String,
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
    phone: {
      type: String,
    },
  
    //  profile image:
    profileImage: {
      type: String,
    },
    isStripeConnected: {
      type: Boolean,
      default: false,
    },
    isProfileCompleted: { 
      type: Boolean, 
      default: false,
    }, 

    // roles:
    role: {
      type: String,
      enum: AuthRoles,
      default: AuthRoles.CUSTOMER,
    },

    status: {
      type: String,
      enum: AuthStatus,
      default: AuthStatus.PENDING,
    },
    verificationStatus: {
      type: String,
      enum: VerificationStatusValues,
      default: verificationStatus.PENDING,
    },
    twoFactorSecret: {
      type: String,
      select: false,
    },
    isTwoFactorEnabled: {
      type: Boolean,
      default: false,
    },
    twoFactorBackupCodes: {
      type: [String],
      select: false,
    },

    // otp verified:
    isOtpVerified: {
      type: Boolean,
      default: false,
    },

    // reason fields:
    blockedReason: {
      type: String,
    },
    deletionReason: {
      type: String,
    },
    rejectionReason: { 
      type: String,
    },
    // blocked at:
    lastLogin: {
      type: Date,
    },
    lastActivity: {
      type: Date,
    },
    blockedAt: {
      type: Date,
    },
    deletedAt: {
      type: Date,
    },
    passwordChangedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
)

// 1. Find user with _id: (Object id)
userSchema.statics.getUserById = async function (id: string): Promise<IUserDoc | null> {
  return this.findById(id)
}

// 2. Find User with email address:
userSchema.statics.isUserExistByEmail = async function (email: string): Promise<IUserDoc | null> {
  return this.findOne({
    email,
  })
}


// 8. remove hash password :
userSchema.post('save', async function (doc, next) {
  doc.passwordHash = ''
  next()
})

// 9. Compare is jwt issued before password changed ?
userSchema.statics.isJwtIssuedBeforePasswordChanged = function (
  passwordChangedAt: Date,
  jwtIssuedTimestamp: number
): boolean {
  if (!passwordChangedAt) {
    return false
  }

  // Convert to milliseconds
  const jwtIssuedTime = jwtIssuedTimestamp * 1000

  // Compare
  return jwtIssuedTime < passwordChangedAt.getTime()
}

export const User = model<IUserDoc, IUserModel>('User', userSchema)
