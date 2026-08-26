// Auth Status
export const AuthStatus = {
  PENDING: 'pending', // signup completed, waiting for next step
  ACTIVE: 'active', // can use the system
  BLOCKED: 'blocked', // admin restricted
  DELETED: 'deleted', // soft-deleted (no login)
} as const

export const verificationStatus = {
  PENDING: 'pending',    
  IN_REVIEW: 'in_review', 
  VERIFIED: 'verified',   
  REJECTED: 'rejected',   
} as const
export const AuthStatusValues = Object.values(AuthStatus)
export const VerificationStatusValues = Object.values(verificationStatus)




// Auth Roles:
export const AuthRoles = {
  SUPER_ADMIN: 'super_admin',
  ADMIN: 'admin',
  ARTIST: 'artist',
  CUSTOMER: 'customer',
} as const

export const AuthRolesValues = Object.values(AuthRoles)


export type TAuthStatus = (typeof AuthStatus)[keyof typeof AuthStatus]
export type TAuthRole = (typeof AuthRoles)[keyof typeof AuthRoles]
export type TVerificationStatus = (typeof verificationStatus)[keyof typeof verificationStatus]