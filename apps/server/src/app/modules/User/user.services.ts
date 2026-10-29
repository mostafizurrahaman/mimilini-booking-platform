import { formatQuery } from '@app/libs'
import type {
  TGetAllUserQueryType,
  TGetUserOverviewQueryType,
  TGetVerificationsDocsQueryType,
} from './user.validations'
import {
  AuthRoles,
  AuthStatus,
  User,
  userSearchableFields,
  userSortableFields,
  type IUser,
} from 'packages/db/src'
import { Types, type PipelineStage } from 'mongoose'
import httpStatus from 'http-status'
import moment from 'moment'
import { AppError } from 'packages/shared/src'

// ?? Get all user:
const getAllUsers = async (user: IUser, query: TGetAllUserQueryType) => {
  const { status, verificationStatus, role } = query
  const { page, limit, skip, sortBy, sortOrder, searchTerm, fromDate, toDate } = formatQuery(
    query,
    userSortableFields
  )

  // ?? Format limit and pagination
  const pipeline: PipelineStage[] = []

  if (user) {
    pipeline.push({
      $match: {
        _id: {
          $ne: user?._id,
        },
      },
    })
  }

  if (fromDate || toDate) {
    const dateFilter: Record<string, unknown> = {}
    if (fromDate) dateFilter.$gte = new Date(fromDate)
    if (toDate) dateFilter.$lte = new Date(toDate)

    pipeline.push({ $match: { createdAt: dateFilter } })
  }

  if (status) {
    pipeline.push({
      $match: {
        status,
      },
    })
  }

  if (verificationStatus) {
    pipeline.push({
      $match: {
        verificationStatus,
      },
    })
  }

  if (role) {
    pipeline.push({
      $match: {
        role,
      },
    })
  }

  if (searchTerm) {
    pipeline.push({
      $match: {
        $or: userSearchableFields.map((field) => ({
          [field]: { $regex: searchTerm, $options: 'i' },
        })),
      },
    })
  }

  pipeline.push(
    {
      $lookup: {
        from: 'artistprofiles',
        localField: '_id',
        foreignField: 'user',
        as: 'artistProfile',
      },
    },

    {
      $unwind: {
        path: '$artistProfile',
        preserveNullAndEmptyArrays: true,
      },
    }
  )

  pipeline.push({
    $replaceWith: {
      $mergeObjects: [
        {
          userId: '$_id',
          name: '$name',
          email: '$email',
          profileImage: { $ifNull: ['$profileImage', null] },
          isStripeConnected: '$isStripeConnected',
          isProfileCompleted: '$isProfileCompleted',
          role: '$role',
          status: '$status',
          verificationStatus: '$verificationStatus',
          isTwoFactorEnabled: '$isTwoFactorEnabled',
          isOtpVerified: '$isOtpVerified',
          blockedReason: { $ifNull: ['$blockedReason', null] },
          rejectionReason: { $ifNull: ['$rejectionReason', null] },
          blockedAt: { $ifNull: ['$blockedAt', null] },
          createdAt: '$createdAt',
          updatedAt: '$updatedAt',
        },

        {
          $cond: [
            { $eq: ['$role', AuthRoles.ARTIST] },
            {
              artistProfileId: '$artistProfile._id',

              businessName: '$artistProfile.businessName',

              abn: '$artistProfile.abn',

              businessAddress: {
                $ifNull: ['$artistProfile.businessAddress', null],
              },

              yearOfExperience: {
                $ifNull: ['$artistProfile.yearOfExperience', null],
              },

              professionalBio: {
                $ifNull: ['$artistProfile.professionalBio', null],
              },

              drivingLicenseFrontSide: {
                $ifNull: ['$artistProfile.drivingLicenseFrontSide', null],
              },

              drivingLicenseBackSide: {
                $ifNull: ['$artistProfile.drivingLicenseBackSide', null],
              },

              selfie: {
                $ifNull: ['$artistProfile.selfie', null],
              },

              location: {
                $ifNull: ['$artistProfile.location', null],
              },

              city: {
                $ifNull: ['$artistProfile.city', null],
              },

              state: {
                $ifNull: ['$artistProfile.state', null],
              },

              postalCode: {
                $ifNull: ['$artistProfile.postalCode', null],
              },

              website: {
                $ifNull: ['$artistProfile.website', null],
              },

              instagram: {
                $ifNull: ['$artistProfile.instagram', null],
              },

              facebook: {
                $ifNull: ['$artistProfile.facebook', null],
              },

              portfolioImages: {
                $ifNull: ['$artistProfile.portfolioImages', []],
              },

              language: {
                $ifNull: ['$artistProfile.language', null],
              },

              travelRadius: {
                $ifNull: ['$artistProfile.travelRadius', null],
              },
            },
            {},
          ],
        },
      ],
    },
  })

  pipeline.push({ $sort: { [sortBy]: sortOrder } })

  pipeline.push({
    $facet: {
      data: [{ $skip: skip }, { $limit: limit }],
      meta: [{ $count: 'total' }],
    },
  })

  const aggregated = await User.aggregate(pipeline)

  const data = aggregated?.[0]?.data || []
  const total = aggregated?.[0]?.meta?.[0]?.total || 0

  return {
    data,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  }
}

// ?? Get users overview:
const getUserOverview = async (payload: TGetUserOverviewQueryType) => {
  const pipeline: PipelineStage[] = []

  // ?? If year provided:
  if (payload?.year) {
    const date = moment(`${payload?.year}-01-01`, 'YYYY-MM-DD')
    const startDate = date.startOf('year')?.toDate()
    const endDate = date.endOf('year')?.toDate()

    pipeline.push({
      $match: {
        createdAt: {
          $gte: startDate,
          $lte: endDate,
        },
      },
    })
  }

  pipeline.push({
    $group: {
      _id: null,
      totalUsers: {
        $sum: 1,
      },
      activeUsers: {
        $sum: {
          $cond: [{ $eq: ['$status', AuthStatus.ACTIVE] }, 1, 0],
        },
      },
      blockedUsers: {
        $sum: {
          $cond: [{ $eq: ['$status', AuthStatus.BLOCKED] }, 1, 0],
        },
      },
      pendingUsers: {
        $sum: {
          $cond: [{ $eq: ['$status', AuthStatus.PENDING] }, 1, 0],
        },
      },
      totalCustomers: {
        $sum: {
          $cond: [{ $eq: ['$role', AuthRoles.CUSTOMER] }, 1, 0],
        },
      },
      totalArtists: {
        $sum: {
          $cond: [{ $eq: ['$role', AuthRoles.ARTIST] }, 1, 0],
        },
      },
    },
  })

  const userStats = await User.aggregate(pipeline)

  return userStats?.[0]
}

// ?? Get verifications (Request)
const getVerificationsDocs = async (user: IUser, query: TGetVerificationsDocsQueryType) => {
  const { status, verificationStatus } = query
  const { page, limit, skip, sortBy, sortOrder, searchTerm, fromDate, toDate } = formatQuery(
    query,
    userSortableFields
  )

  // ?? Format limit and pagination
  const pipeline: PipelineStage[] = [
    {
      $match: {
        role: AuthRoles.ARTIST,
      },
    },
  ]

  if (user) {
    pipeline.push({
      $match: {
        _id: {
          $ne: user?._id,
        },
      },
    })
  }

  if (fromDate || toDate) {
    const dateFilter: Record<string, unknown> = {}
    if (fromDate) dateFilter.$gte = new Date(fromDate)
    if (toDate) dateFilter.$lte = new Date(toDate)

    pipeline.push({ $match: { createdAt: dateFilter } })
  }

  if (status) {
    pipeline.push({
      $match: {
        status,
      },
    })
  }

  if (verificationStatus) {
    pipeline.push({
      $match: {
        verificationStatus,
      },
    })
  }

  if (searchTerm) {
    pipeline.push({
      $match: {
        $or: userSearchableFields.map((field) => ({
          [field]: { $regex: searchTerm, $options: 'i' },
        })),
      },
    })
  }

  pipeline.push(
    {
      $lookup: {
        from: 'artistprofiles',
        localField: '_id',
        foreignField: 'user',
        as: 'artistProfile',
      },
    },

    {
      $unwind: {
        path: '$artistProfile',
        preserveNullAndEmptyArrays: true,
      },
    }
  )

  pipeline.push({
    $replaceWith: {
      $mergeObjects: [
        {
          userId: '$_id',
          name: '$name',
          email: '$email',
          profileImage: { $ifNull: ['$profileImage', null] },
          isStripeConnected: '$isStripeConnected',
          isProfileCompleted: '$isProfileCompleted',
          role: '$role',
          status: '$status',
          verificationStatus: '$verificationStatus',
          isTwoFactorEnabled: '$isTwoFactorEnabled',
          isOtpVerified: '$isOtpVerified',
          blockedReason: { $ifNull: ['$blockedReason', null] },
          rejectionReason: { $ifNull: ['$rejectionReason', null] },
          blockedAt: { $ifNull: ['$blockedAt', null] },
          createdAt: '$createdAt',
          updatedAt: '$updatedAt',
        },

        {
          $cond: [
            { $eq: ['$role', AuthRoles.ARTIST] },
            {
              artistProfileId: '$artistProfile._id',

              businessName: '$artistProfile.businessName',

              abn: '$artistProfile.abn',

              businessAddress: {
                $ifNull: ['$artistProfile.businessAddress', null],
              },

              yearOfExperience: {
                $ifNull: ['$artistProfile.yearOfExperience', null],
              },

              professionalBio: {
                $ifNull: ['$artistProfile.professionalBio', null],
              },

              drivingLicenseFrontSide: {
                $ifNull: ['$artistProfile.drivingLicenseFrontSide', null],
              },

              drivingLicenseBackSide: {
                $ifNull: ['$artistProfile.drivingLicenseBackSide', null],
              },

              selfie: {
                $ifNull: ['$artistProfile.selfie', null],
              },

              location: {
                $ifNull: ['$artistProfile.location', null],
              },

              city: {
                $ifNull: ['$artistProfile.city', null],
              },

              state: {
                $ifNull: ['$artistProfile.state', null],
              },

              postalCode: {
                $ifNull: ['$artistProfile.postalCode', null],
              },

              website: {
                $ifNull: ['$artistProfile.website', null],
              },

              instagram: {
                $ifNull: ['$artistProfile.instagram', null],
              },

              facebook: {
                $ifNull: ['$artistProfile.facebook', null],
              },

              portfolioImages: {
                $ifNull: ['$artistProfile.portfolioImages', []],
              },

              language: {
                $ifNull: ['$artistProfile.language', null],
              },

              travelRadius: {
                $ifNull: ['$artistProfile.travelRadius', null],
              },
            },
            {},
          ],
        },
      ],
    },
  })

  pipeline.push({ $sort: { [sortBy]: sortOrder } })

  pipeline.push({
    $facet: {
      data: [{ $skip: skip }, { $limit: limit }],
      meta: [{ $count: 'total' }],
    },
  })

  const aggregated = await User.aggregate(pipeline)

  const data = aggregated?.[0]?.data || []
  const total = aggregated?.[0]?.meta?.[0]?.total || 0

  return {
    data,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  }
}

// ?? Get user by Id (Admin)
const getUserDetailsById = async (id: string) => {
  const pipeline: PipelineStage[] = []

  pipeline.push(
    {
      $match: {
        _id: new Types.ObjectId(id),
      },
    },
    {
      $lookup: {
        from: 'artistprofiles',
        localField: '_id',
        foreignField: 'user',
        as: 'artistProfile',
      },
    },

    {
      $unwind: {
        path: '$artistProfile',
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $replaceWith: {
        $mergeObjects: [
          {
            userId: '$_id',
            name: '$name',
            email: '$email',
            profileImage: { $ifNull: ['$profileImage', null] },
            isStripeConnected: '$isStripeConnected',
            isProfileCompleted: '$isProfileCompleted',
            role: '$role',
            status: '$status',
            verificationStatus: '$verificationStatus',
            isTwoFactorEnabled: '$isTwoFactorEnabled',
            isOtpVerified: '$isOtpVerified',
            blockedReason: { $ifNull: ['$blockedReason', null] },
            rejectionReason: { $ifNull: ['$rejectionReason', null] },
            blockedAt: { $ifNull: ['$blockedAt', null] },
            createdAt: '$createdAt',
            updatedAt: '$updatedAt',
          },

          {
            $cond: [
              { $eq: ['$role', AuthRoles.ARTIST] },
              {
                artistProfileId: '$artistProfile._id',

                businessName: '$artistProfile.businessName',

                abn: '$artistProfile.abn',

                businessAddress: {
                  $ifNull: ['$artistProfile.businessAddress', null],
                },

                yearOfExperience: {
                  $ifNull: ['$artistProfile.yearOfExperience', null],
                },

                professionalBio: {
                  $ifNull: ['$artistProfile.professionalBio', null],
                },

                drivingLicenseFrontSide: {
                  $ifNull: ['$artistProfile.drivingLicenseFrontSide', null],
                },

                drivingLicenseBackSide: {
                  $ifNull: ['$artistProfile.drivingLicenseBackSide', null],
                },

                selfie: {
                  $ifNull: ['$artistProfile.selfie', null],
                },

                location: {
                  $ifNull: ['$artistProfile.location', null],
                },

                city: {
                  $ifNull: ['$artistProfile.city', null],
                },

                state: {
                  $ifNull: ['$artistProfile.state', null],
                },

                postalCode: {
                  $ifNull: ['$artistProfile.postalCode', null],
                },

                website: {
                  $ifNull: ['$artistProfile.website', null],
                },

                instagram: {
                  $ifNull: ['$artistProfile.instagram', null],
                },

                facebook: {
                  $ifNull: ['$artistProfile.facebook', null],
                },

                portfolioImages: {
                  $ifNull: ['$artistProfile.portfolioImages', []],
                },

                language: {
                  $ifNull: ['$artistProfile.language', null],
                },

                travelRadius: {
                  $ifNull: ['$artistProfile.travelRadius', null],
                },
              },
              {},
            ],
          },
        ],
      },
    }
  )

  const user = await User.aggregate(pipeline)

  if (!user?.[0]) {
    throw new AppError(httpStatus.BAD_REQUEST, '')
  }

  return user[0]
}

export const userServices = {
  getAllUsers,
  getUserOverview,
  getVerificationsDocs,
  getUserDetailsById,
}
