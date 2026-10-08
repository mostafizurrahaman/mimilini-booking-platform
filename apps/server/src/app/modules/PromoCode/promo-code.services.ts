import {
  AuthRoles,
  DISCOUNT_STATUS,
  DISCOUNT_TYPES,
  PromoCode,
  promoCodeSearchableFields,
  promoCodeSortableFields,
  type IUser,
  type TDiscountStatusType,
} from '@repo/db'
import httpStatus from 'http-status'
import { AppError } from '@repo/shared'
import { type PipelineStage, Types } from 'mongoose'
import moment from 'moment'
import { formatQuery } from '@app/libs'

import type {
  TCreatePromoCodePayloadType,
  TUpdatePromoCodePayloadType,
  TUpdatePromoCodeStatusPayloadType,
  TValidatePromoCodePayloadType,
  TGetAllPromoCodeQueryParamsType,
  TGetMyPromoCodesQueryParamsType,
} from './promo-code.validations'

/**
 * Resolves the appropriate promo code status based on date ranges:
 * - EXPIRED: If now > endDate
 * - SCHEDULED: If now < startDate (and not paused)
 * - ACTIVE: If startDate <= now <= endDate (and not paused)
 * - PAUSE: If currently paused (and now <= endDate)
 */
const resolveStatusByDate = (
  startDate: Date,
  endDate: Date,
  currentStatus?: TDiscountStatusType
): TDiscountStatusType => {
  const now = new Date()
  const start = new Date(startDate)
  const end = new Date(endDate)

  if (now > end) {
    return DISCOUNT_STATUS.EXPIRED
  }

  if (currentStatus === DISCOUNT_STATUS.PAUSE) {
    return DISCOUNT_STATUS.PAUSE
  }

  if (now < start) {
    return DISCOUNT_STATUS.SCHEDULED
  }

  return DISCOUNT_STATUS.ACTIVE
}

/**
 * Synchronizes promo code statuses across the database based on the current date:
 * - Transitions past-date promotions to EXPIRED
 * - Transitions scheduled promotions whose start date has arrived to ACTIVE
 */
const syncPromoCodeStatuses = async () => {
  const now = new Date()

  await Promise.all([
    // Expire promotions whose end date has passed
    PromoCode.updateMany(
      {
        status: { $ne: DISCOUNT_STATUS.EXPIRED },
        endDate: { $lt: now },
      },
      { $set: { status: DISCOUNT_STATUS.EXPIRED } }
    ),
    // Activate scheduled promotions whose start date has arrived
    PromoCode.updateMany(
      {
        status: DISCOUNT_STATUS.SCHEDULED,
        startDate: { $lte: now },
        endDate: { $gte: now },
      },
      { $set: { status: DISCOUNT_STATUS.ACTIVE } }
    ),
  ])
}

const createPromoCode = async (user: IUser, payload: TCreatePromoCodePayloadType) => {
  const {
    promotionName,
    promoCode,
    discountType,
    discountValue,
    maxDiscountAmount,
    minBookingValue = 0,
    startDate,
    endDate,
    usageLimit,
    status,
  } = payload

  // Check if admin offer
  const isAdminOffer =
    user.role === AuthRoles.ADMIN || user.role === AuthRoles.SUPER_ADMIN

  const normalizedCode = promoCode.trim().toUpperCase()

  // Check if promo code already exists for this author or admin pool
  if (isAdminOffer) {
    const existingPromoCode = await PromoCode.findOne({
      promoCode: normalizedCode,
      isAdminOffer: true,
    })
    if (existingPromoCode) {
      throw new AppError(
        httpStatus.CONFLICT,
        'An admin promo code with this code already exists.'
      )
    }
  } else {
    const existingPromoCode = await PromoCode.findOne({
      promoCode: normalizedCode,
      author: user._id,
    })
    if (existingPromoCode) {
      throw new AppError(
        httpStatus.CONFLICT,
        'You already have a promo code with this code.'
      )
    }
  }

  // Calculate status based on date range
  const initialStatus = resolveStatusByDate(startDate, endDate, status)

  const createData: Record<string, unknown> = {
    promotionName: promotionName.trim(),
    promoCode: normalizedCode,
    discountType,
    discountValue,
    minBookingValue,
    usageLimit,
    usageCount: 0,
    startDate,
    endDate,
    status: initialStatus,
    isAdminOffer,
    author: user._id,
  }

  if (maxDiscountAmount !== undefined) {
    createData.maxDiscountAmount = maxDiscountAmount
  }

  const result = await PromoCode.create(createData)

  return result
}

const updatePromoCode = async (
  user: IUser,
  id: string,
  payload: TUpdatePromoCodePayloadType
) => {
  const existingCode = await PromoCode.findById(id)
  if (!existingCode) {
    throw new AppError(httpStatus.NOT_FOUND, 'Promo code not found.')
  }

  const isUserAdmin =
    user.role === AuthRoles.ADMIN || user.role === AuthRoles.SUPER_ADMIN

  // Authorization check
  if (existingCode.isAdminOffer && !isUserAdmin) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      'You are not authorized to update this platform promo code.'
    )
  }

  if (
    !existingCode.isAdminOffer &&
    existingCode.author.toString() !== user._id?.toString() &&
    !isUserAdmin
  ) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      'This promo code does not belong to your account.'
    )
  }

  // Code uniqueness check if promoCode is being changed
  if (payload.promoCode) {
    const newCode = payload.promoCode.trim().toUpperCase()
    if (newCode !== existingCode.promoCode) {
      const duplicateQuery = existingCode.isAdminOffer
        ? { promoCode: newCode, isAdminOffer: true, _id: { $ne: id } }
        : {
            promoCode: newCode,
            author: existingCode.author,
            _id: { $ne: id },
          }

      const duplicate = await PromoCode.findOne(duplicateQuery)
      if (duplicate) {
        throw new AppError(
          httpStatus.CONFLICT,
          'A promo code with this code already exists.'
        )
      }
      payload.promoCode = newCode
    }
  }

  // Cross-field validations for updates
  const effectiveDiscountType =
    payload.discountType || existingCode.discountType
  const effectiveDiscountValue =
    payload.discountValue !== undefined
      ? payload.discountValue
      : existingCode.discountValue

  if (
    effectiveDiscountType === DISCOUNT_TYPES.PERCENTAGE &&
    effectiveDiscountValue > 100
  ) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Percentage discount cannot exceed 100%.'
    )
  }

  const effectiveStartDate = payload.startDate
    ? new Date(payload.startDate)
    : existingCode.startDate
  const effectiveEndDate = payload.endDate
    ? new Date(payload.endDate)
    : existingCode.endDate

  if (effectiveEndDate <= effectiveStartDate) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'End date must be after start date.'
    )
  }

  // Handle status based on the updated dates:
  // If status is not explicitly passed in payload, re-resolve based on new dates
  if (!payload.status) {
    payload.status = resolveStatusByDate(
      effectiveStartDate,
      effectiveEndDate,
      existingCode.status
    )
  }

  const result = await PromoCode.findByIdAndUpdate(
    id,
    { $set: payload },
    { new: true, runValidators: true }
  )

  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, 'Promo code not found.')
  }

  return result
}

const updatePromoCodeStatus = async (
  user: IUser,
  id: string,
  payload: TUpdatePromoCodeStatusPayloadType
) => {
  const { status } = payload
  const existingCode = await PromoCode.findById(id)
  if (!existingCode) {
    throw new AppError(httpStatus.NOT_FOUND, 'Promo code not found.')
  }

  const isUserAdmin =
    user.role === AuthRoles.ADMIN || user.role === AuthRoles.SUPER_ADMIN

  if (existingCode.isAdminOffer && !isUserAdmin) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      'You are not authorized to update this platform promo code.'
    )
  }

  if (
    !existingCode.isAdminOffer &&
    existingCode.author.toString() !== user._id?.toString() &&
    !isUserAdmin
  ) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      'This promo code does not belong to your account.'
    )
  }

  const now = new Date()

  // Validate status transition strictly based on dates
  if (status === DISCOUNT_STATUS.ACTIVE) {
    if (now > existingCode.endDate) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'Cannot activate an expired promo code. Please extend the end date first.'
      )
    }
    if (now < existingCode.startDate) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        `Cannot activate promo code before its start date (${moment(existingCode.startDate).format('YYYY-MM-DD')}). Status is scheduled.`
      )
    }
  }

  if (status === DISCOUNT_STATUS.SCHEDULED) {
    if (now >= existingCode.startDate) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'Cannot schedule promo code whose start date has already arrived or passed.'
      )
    }
  }

  if (status === DISCOUNT_STATUS.PAUSE) {
    if (now > existingCode.endDate) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'Cannot pause a promo code that has already expired.'
      )
    }
  }

  if (existingCode.status === status) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `Promo code is already in "${status}" status.`
    )
  }

  existingCode.status = status
  await existingCode.save()

  return existingCode
}

const getAllPromoCode = async (query: TGetAllPromoCodeQueryParamsType) => {
  // Synchronize statuses across all promo codes based on current date
  await syncPromoCodeStatuses()

  const { page, limit, searchTerm, sortOrder, sortBy, fromDate, toDate } =
    formatQuery(query, promoCodeSortableFields)

  const { status, discountType, isAdminOffer, author } = query
  const skip = (page - 1) * limit
  const pipeline: PipelineStage[] = []

  const matchFilter: Record<string, unknown> = {}

  if (fromDate || toDate) {
    const dateFilter: Record<string, Date> = {}
    if (fromDate) dateFilter.$gte = fromDate
    if (toDate) dateFilter.$lte = toDate
    matchFilter.createdAt = dateFilter
  }

  if (status) {
    matchFilter.status = status
  }

  if (discountType) {
    matchFilter.discountType = discountType
  }

  if (isAdminOffer !== undefined) {
    matchFilter.isAdminOffer =
      String(isAdminOffer).toLowerCase() === 'true'
  }

  if (author && Types.ObjectId.isValid(String(author))) {
    matchFilter.author = new Types.ObjectId(String(author))
  }

  if (searchTerm) {
    matchFilter.$or = promoCodeSearchableFields.map((field) => ({
      [field]: { $regex: searchTerm, $options: 'i' },
    }))
  }

  if (Object.keys(matchFilter).length > 0) {
    pipeline.push({ $match: matchFilter })
  }

  pipeline.push({
    $lookup: {
      from: 'users',
      localField: 'author',
      foreignField: '_id',
      as: 'authorDetails',
      pipeline: [
        {
          $project: {
            _id: 1,
            name: 1,
            email: 1,
            role: 1,
            avatar: 1,
          },
        },
      ],
    },
  })

  pipeline.push({
    $unwind: {
      path: '$authorDetails',
      preserveNullAndEmptyArrays: true,
    },
  })

  pipeline.push({ $sort: { [sortBy]: sortOrder } })

  pipeline.push({
    $facet: {
      data: [{ $skip: skip }, { $limit: limit }],
      meta: [{ $count: 'total' }],
    },
  })

  const aggregated = await PromoCode.aggregate(pipeline)

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

const getMyPromoCodes = async (
  user: IUser,
  query: TGetMyPromoCodesQueryParamsType
) => {
  // Synchronize statuses across all promo codes based on current date
  await syncPromoCodeStatuses()

  const { page, limit, searchTerm, sortOrder, sortBy, fromDate, toDate } =
    formatQuery(query, promoCodeSortableFields)

  const { status, discountType } = query
  const skip = (page - 1) * limit
  const authorObjectId = new Types.ObjectId(user._id?.toString())

  const matchFilter: Record<string, unknown> = {
    author: authorObjectId,
  }

  if (fromDate || toDate) {
    const dateFilter: Record<string, Date> = {}
    if (fromDate) dateFilter.$gte = fromDate
    if (toDate) dateFilter.$lte = toDate
    matchFilter.createdAt = dateFilter
  }

  if (status) {
    matchFilter.status = status
  }

  if (discountType) {
    matchFilter.discountType = discountType
  }

  if (searchTerm) {
    matchFilter.$or = promoCodeSearchableFields.map((field) => ({
      [field]: { $regex: searchTerm, $options: 'i' },
    }))
  }

  const pipeline: PipelineStage[] = [
    { $match: matchFilter },
    { $sort: { [sortBy]: sortOrder } },
    {
      $facet: {
        data: [{ $skip: skip }, { $limit: limit }],
        meta: [{ $count: 'total' }],
      },
    },
  ]

  const [aggregated, statsData] = await Promise.all([
    PromoCode.aggregate(pipeline),
    PromoCode.aggregate([
      { $match: { author: authorObjectId } },
      {
        $group: {
          _id: null,
          totalPromoCodes: { $sum: 1 },
          activeCount: {
            $sum: { $cond: [{ $eq: ['$status', DISCOUNT_STATUS.ACTIVE] }, 1, 0] },
          },
          scheduledCount: {
            $sum: {
              $cond: [{ $eq: ['$status', DISCOUNT_STATUS.SCHEDULED] }, 1, 0],
            },
          },
          pausedCount: {
            $sum: { $cond: [{ $eq: ['$status', DISCOUNT_STATUS.PAUSE] }, 1, 0] },
          },
          expiredCount: {
            $sum: {
              $cond: [{ $eq: ['$status', DISCOUNT_STATUS.EXPIRED] }, 1, 0],
            },
          },
          totalUsageCount: { $sum: '$usageCount' },
        },
      },
    ]),
  ])

  const data = aggregated?.[0]?.data || []
  const total = aggregated?.[0]?.meta?.[0]?.total || 0

  const stats = statsData?.[0] || {
    totalPromoCodes: 0,
    activeCount: 0,
    scheduledCount: 0,
    pausedCount: 0,
    expiredCount: 0,
    totalUsageCount: 0,
  }

  return {
    data,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
    stats: {
      totalPromoCodes: stats.totalPromoCodes,
      activeCount: stats.activeCount,
      scheduledCount: stats.scheduledCount,
      pausedCount: stats.pausedCount,
      expiredCount: stats.expiredCount,
      totalUsageCount: stats.totalUsageCount,
    },
  }
}

const getPromoCodeById = async (user: IUser, id: string) => {
  const result = await PromoCode.findById(id).populate(
    'author',
    'name email avatar role'
  )

  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, 'Promo code not found.')
  }

  // Update status based on current date if needed
  const now = new Date()
  let hasStatusChanged = false

  if (now > result.endDate && result.status !== DISCOUNT_STATUS.EXPIRED) {
    result.status = DISCOUNT_STATUS.EXPIRED
    hasStatusChanged = true
  } else if (
    now >= result.startDate &&
    now <= result.endDate &&
    result.status === DISCOUNT_STATUS.SCHEDULED
  ) {
    result.status = DISCOUNT_STATUS.ACTIVE
    hasStatusChanged = true
  }

  if (hasStatusChanged) {
    await PromoCode.updateOne(
      { _id: result._id },
      { status: result.status }
    )
  }

  const isUserAdmin =
    user.role === AuthRoles.ADMIN || user.role === AuthRoles.SUPER_ADMIN

  // If user is an artist and not admin, check that promo code is either an admin offer or authored by the artist
  if (
    !isUserAdmin &&
    user.role === AuthRoles.ARTIST &&
    !result.isAdminOffer &&
    result.author._id?.toString() !== user._id?.toString()
  ) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      'You are not authorized to view this promo code.'
    )
  }

  return result
}

const deletePromoCodeById = async (user: IUser, id: string) => {
  const existingCode = await PromoCode.findById(id)
  if (!existingCode) {
    throw new AppError(httpStatus.NOT_FOUND, 'Promo code not found.')
  }

  const isUserAdmin =
    user.role === AuthRoles.ADMIN || user.role === AuthRoles.SUPER_ADMIN

  if (existingCode.isAdminOffer && !isUserAdmin) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      'You are not authorized to delete this platform promo code.'
    )
  }

  if (
    !existingCode.isAdminOffer &&
    existingCode.author.toString() !== user._id?.toString() &&
    !isUserAdmin
  ) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      'This promo code does not belong to your account.'
    )
  }

  const result = await PromoCode.findByIdAndDelete(id)

  return result
}

const validatePromoCode = async (payload: TValidatePromoCodePayloadType) => {
  const { promoCode, bookingAmount, artistId } = payload
  const normalizedCode = promoCode.trim().toUpperCase()

  let promo = null

  // If artistId is provided, check for artist-specific promo code first, then global admin promo code
  if (artistId && Types.ObjectId.isValid(artistId)) {
    promo = await PromoCode.findOne({
      promoCode: normalizedCode,
      author: new Types.ObjectId(artistId),
      isAdminOffer: false,
    })

    if (!promo) {
      promo = await PromoCode.findOne({
        promoCode: normalizedCode,
        isAdminOffer: true,
      })
    }
  } else {
    // If no artistId is provided, look for admin offer first, or any active promo code
    promo = await PromoCode.findOne({
      promoCode: normalizedCode,
      isAdminOffer: true,
    })

    if (!promo) {
      promo = await PromoCode.findOne({
        promoCode: normalizedCode,
      })
    }
  }

  if (!promo) {
    throw new AppError(
      httpStatus.NOT_FOUND,
      'Invalid promo code. Please check the code and try again.'
    )
  }

  const now = new Date()

  // 1. Date-based expiry check
  if (now > promo.endDate) {
    if (promo.status !== DISCOUNT_STATUS.EXPIRED) {
      await PromoCode.updateOne(
        { _id: promo._id },
        { status: DISCOUNT_STATUS.EXPIRED }
      )
    }
    throw new AppError(httpStatus.BAD_REQUEST, 'This promo code has expired.')
  }

  // 2. Date-based scheduled check
  if (now < promo.startDate) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `This promo code is not active yet. It will be valid starting ${moment(promo.startDate).format('YYYY-MM-DD')}.`
    )
  }

  // 3. If within date range and still marked scheduled, promote to active in DB
  if (promo.status === DISCOUNT_STATUS.SCHEDULED) {
    promo.status = DISCOUNT_STATUS.ACTIVE
    await PromoCode.updateOne(
      { _id: promo._id },
      { status: DISCOUNT_STATUS.ACTIVE }
    )
  }

  // 4. Check if paused
  if (promo.status === DISCOUNT_STATUS.PAUSE) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'This promo code is currently paused and cannot be used.'
    )
  }

  // 5. Check if expired
  if (promo.status === DISCOUNT_STATUS.EXPIRED) {
    throw new AppError(httpStatus.BAD_REQUEST, 'This promo code has expired.')
  }

  // 6. Check usage limit
  if (promo.usageCount >= promo.usageLimit) {
    await PromoCode.updateOne(
      { _id: promo._id },
      { status: DISCOUNT_STATUS.EXPIRED }
    )
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'This promo code has reached its maximum usage limit.'
    )
  }

  // 7. Check minimum booking spend
  if (bookingAmount < promo.minBookingValue) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `Minimum booking spend of $${promo.minBookingValue.toFixed(2)} AUD is required to apply this promo code.`
    )
  }

  // Calculate discount amount
  let discountAmount = 0
  if (promo.discountType === DISCOUNT_TYPES.PERCENTAGE) {
    discountAmount = (bookingAmount * promo.discountValue) / 100
    if (promo.maxDiscountAmount && promo.maxDiscountAmount > 0) {
      discountAmount = Math.min(discountAmount, promo.maxDiscountAmount)
    }
  } else {
    discountAmount = promo.discountValue
  }

  // Cap discount to booking amount (discount cannot exceed total price)
  discountAmount = Math.min(discountAmount, bookingAmount)
  discountAmount = Math.round(discountAmount * 100) / 100

  const finalAmount = Math.max(
    0,
    Math.round((bookingAmount - discountAmount) * 100) / 100
  )

  return {
    valid: true,
    promoCodeId: promo._id,
    promoCode: promo.promoCode,
    promotionName: promo.promotionName,
    discountType: promo.discountType,
    discountValue: promo.discountValue,
    maxDiscountAmount: promo.maxDiscountAmount,
    minBookingValue: promo.minBookingValue,
    bookingAmount,
    discountAmount,
    finalAmount,
    isAdminOffer: promo.isAdminOffer,
  }
}

const incrementUsageCount = async (promoCodeId: string) => {
  const promo = await PromoCode.findById(promoCodeId)
  if (!promo) return null

  promo.usageCount += 1
  if (promo.usageCount >= promo.usageLimit) {
    promo.status = DISCOUNT_STATUS.EXPIRED
  }

  await promo.save()
  return promo
}

export const promoCodeServices = {
  createPromoCode,
  updatePromoCode,
  updatePromoCodeStatus,
  getAllPromoCode,
  getMyPromoCodes,
  getPromoCodeById,
  deletePromoCodeById,
  validatePromoCode,
  incrementUsageCount,
  resolveStatusByDate,
  syncPromoCodeStatuses,
}
