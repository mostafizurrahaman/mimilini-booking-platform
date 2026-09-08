import { formatQuery } from '@app/libs'
import type { TGetAllUserQueryType } from './user.validations'
import {
  AuthRoles,
  User,
  userSearchableFields,
  userSortableFields,
  type IUser,
} from 'packages/db/src'
import type { PipelineStage } from 'mongoose'

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

export const userServices = {
  getAllUsers,
}
