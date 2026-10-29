import { notificationServices } from '../Notification/notification.services'
import { logger } from '@app/libs/logger'
import {
  ADMIN_REVIEW_ACTION,
  ArtistProfile,
  ArtistServices,
  AuthRoles,
  AuthStatus,
  Booking,
  BOOKING_STATUS,
  NOTIFICATION_TYPE,
  Review,
  REVIEW_MODERATION_STATUS,
  REVIEW_TAG_OPTIONS,
  User,
  type IUser,
  type TAdminReviewAction,
} from '@repo/db'
import { AppError } from '@repo/shared'
import httpStatus from 'http-status'
import moment from 'moment'
import { Types } from 'mongoose'
import { uploadMultipleFileToS3, uploadSingleFileToS3 } from 'packages/media-hub/src'
import { AWS_FOLDER_NAMES } from '@app/libs/files_folder'

const validateObjectId = (id: string, label = 'ID') => {
  if (!Types.ObjectId.isValid(id)) {
    throw new AppError(httpStatus.BAD_REQUEST, `Invalid ${label}`)
  }
}

const getInitials = (name?: string | null): string => {
  if (!name) return 'U'
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) {
    return `${parts[0]![0] || ''}${parts[1]![0] || ''}`.toUpperCase()
  }
  return (name.charAt(0) || 'U').toUpperCase()
}

/**
 * Helper API to upload review images (beforeImage, afterImage, gallery images) to S3
 */
const uploadReviewImages = async (
  files?:
    | Express.Multer.File[]
    | {
        beforeImage?: Express.Multer.File[]
        afterImage?: Express.Multer.File[]
        images?: Express.Multer.File[]
      }
) => {
  if (!files) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Please provide at least one image file')
  }

  if (Array.isArray(files)) {
    if (files.length === 0) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Please provide at least one image file')
    }
    const uploaded = await uploadMultipleFileToS3(files, AWS_FOLDER_NAMES.ReviewImages)
    return {
      beforeImage: null,
      afterImage: null,
      images: uploaded.map((item) => item.url),
    }
  }

  let beforeImageUrl: string | null = null
  let afterImageUrl: string | null = null
  let galleryUrls: string[] = []

  if (files.beforeImage?.[0]) {
    const up = await uploadSingleFileToS3(files.beforeImage[0], AWS_FOLDER_NAMES.ReviewImages)
    beforeImageUrl = up?.url || null
  }

  if (files.afterImage?.[0]) {
    const up = await uploadSingleFileToS3(files.afterImage[0], AWS_FOLDER_NAMES.ReviewImages)
    afterImageUrl = up?.url || null
  }

  if (files.images && files.images.length > 0) {
    const up = await uploadMultipleFileToS3(files.images, AWS_FOLDER_NAMES.ReviewImages)
    galleryUrls = up.map((item) => item.url)
  }

  if (!beforeImageUrl && !afterImageUrl && galleryUrls.length === 0) {
    throw new AppError(httpStatus.BAD_REQUEST, 'No valid review images were uploaded')
  }

  return {
    beforeImage: beforeImageUrl,
    afterImage: afterImageUrl,
    images: galleryUrls,
  }
}

/**
 * Submit a review for a completed booking (Figma customer/23.png)
 */
const createReview = async (
  user: IUser,
  payload: {
    bookingId: string
    rating: number
    tags?: string[] | undefined
    comment?: string | undefined
    beforeImage?: string | undefined
    afterImage?: string | undefined
    images?: string[] | undefined
  },
  uploadedFiles?: {
    beforeImage?: Express.Multer.File[]
    afterImage?: Express.Multer.File[]
    images?: Express.Multer.File[]
  }
) => {
  const bookingQuery = Types.ObjectId.isValid(payload.bookingId)
    ? { _id: new Types.ObjectId(payload.bookingId) }
    : { bookingNumber: payload.bookingId }

  const booking = await Booking.findOne(bookingQuery)
    .populate('service', 'name')
    .populate('address')
    .lean()

  if (!booking) {
    throw new AppError(httpStatus.NOT_FOUND, 'Booking not found')
  }

  if (String(booking.customer) !== String(user._id)) {
    throw new AppError(httpStatus.FORBIDDEN, 'You can only review your own bookings')
  }

  if (booking.status !== BOOKING_STATUS.COMPLETED) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      `You can only submit a review after the booking is completed (current status: '${booking.status}')`
    )
  }

  const existingReview = await Review.findOne({ booking: booking._id }).lean()
  if (existingReview) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'You have already submitted a review for this booking'
    )
  }

  // Handle any multipart uploaded files alongside body URLs
  let beforeImageUrl = payload.beforeImage?.trim() || null
  let afterImageUrl = payload.afterImage?.trim() || null
  const galleryImages: string[] = Array.isArray(payload.images)
    ? payload.images.map((u) => u.trim()).filter(Boolean)
    : []

  if (uploadedFiles?.beforeImage?.[0]) {
    const up = await uploadSingleFileToS3(
      uploadedFiles.beforeImage[0],
      AWS_FOLDER_NAMES.ReviewImages
    )
    if (up?.url) beforeImageUrl = up.url
  }

  if (uploadedFiles?.afterImage?.[0]) {
    const up = await uploadSingleFileToS3(
      uploadedFiles.afterImage[0],
      AWS_FOLDER_NAMES.ReviewImages
    )
    if (up?.url) afterImageUrl = up.url
  }

  if (uploadedFiles?.images && uploadedFiles.images.length > 0) {
    const up = await uploadMultipleFileToS3(uploadedFiles.images, AWS_FOLDER_NAMES.ReviewImages)
    galleryImages.push(...up.map((item) => item.url).filter(Boolean))
  }

  const totalPhotosCount =
    (beforeImageUrl ? 1 : 0) + (afterImageUrl ? 1 : 0) + galleryImages.length

  if (totalPhotosCount > 6) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'You can upload a maximum of 6 photos in total (including before, after, and gallery photos)'
    )
  }

  // Resolve serviceName and location for Customer Stories cards (Figma customer/11.png & 10.png)
  const populatedService = booking.service as unknown as { _id?: Types.ObjectId; name?: string } | null
  let serviceName = populatedService?.name || null
  if (!serviceName && booking.service) {
    const svc = await ArtistServices.findById(booking.service).select('name').lean()
    serviceName = svc?.name || null
  }

  const artistProfile = await ArtistProfile.findOne({ user: booking.artist })
    .select('city state businessName')
    .lean()

  const populatedAddress = booking.address as unknown as {
    city?: string
    state?: string
    address?: string
  } | null

  const location =
    [populatedAddress?.city, populatedAddress?.state].filter(Boolean).join(', ') ||
    [artistProfile?.city, artistProfile?.state].filter(Boolean).join(', ') ||
    booking.serviceLocationSnapshot?.address ||
    'Australia'

  // Generate sequential reviewNumber (e.g. REV-1029)
  const totalCount = await Review.countDocuments()
  const reviewNumber = `REV-${1001 + totalCount}`

  const hasPhotos = Boolean(beforeImageUrl || afterImageUrl || galleryImages.length > 0)
  const isFeaturedStory = payload.rating >= 4 && (hasPhotos || Boolean(payload.comment?.trim()))

  const review = await Review.create({
    reviewNumber,
    customer: new Types.ObjectId(String(user._id)),
    artist: new Types.ObjectId(String(booking.artist)),
    booking: new Types.ObjectId(String(booking._id)),
    service: populatedService?._id
      ? new Types.ObjectId(String(populatedService._id))
      : booking.service
        ? new Types.ObjectId(String(booking.service))
        : null,
    serviceName: serviceName || 'Beauty Service',
    location,
    rating: Number(payload.rating),
    tags: Array.isArray(payload.tags) ? payload.tags : [],
    comment: payload.comment?.trim() || '',
    beforeImage: beforeImageUrl,
    afterImage: afterImageUrl,
    images: galleryImages,
    isVerifiedBooking: true,
    isFeaturedStory,
    moderationStatus: REVIEW_MODERATION_STATUS.APPROVED,
    isFakeFlagged: false,
    reports: [],
    reportsCount: 0,
    isActive: true,
  })

  try {
    await notificationServices.sendNotification({
      recipient: booking.artist,
      sender: user._id,
      senderName: user.name,
      senderPicture: user.profileImage,
      title: 'New Review Received',
      message: `${user.name} left a ${payload.rating}-star review for booking #${booking.bookingNumber}`,
      type: NOTIFICATION_TYPE.REVIEW_RECEIVED,
      bookingId: booking._id,
      bookingNumber: booking.bookingNumber,
      actionUrl: `/reviews/artist/${booking.artist}`,
    })
  } catch (notifErr) {
    logger.warn('[Review Notification] Failed to notify artist:', notifErr)
  }

  return review
}

/**
 * Get Customer Stories list for Home Page & Customer Stories Screen (Figma customer/2.png & customer/11.png)
 */
const getCustomerStories = async (query: {
  page?: string | number | undefined
  limit?: string | number | undefined
  featuredOnly?: string | undefined
  serviceName?: string | undefined
  searchTerm?: string | undefined
}) => {
  const page = Math.max(1, Number(query.page) || 1)
  const limit = Math.min(50, Math.max(1, Number(query.limit) || 10))
  const skip = (page - 1) * limit

  const filter: Record<string, unknown> = {
    isActive: true,
    moderationStatus: {
      $nin: [REVIEW_MODERATION_STATUS.HIDDEN, REVIEW_MODERATION_STATUS.REMOVED],
    },
  }

  if (query.featuredOnly === 'true') {
    filter.isFeaturedStory = true
  }

  if (query.serviceName?.trim()) {
    filter.serviceName = { $regex: query.serviceName.trim(), $options: 'i' }
  }

  if (query.searchTerm?.trim()) {
    const regex = new RegExp(query.searchTerm.trim(), 'i')
    filter.$or = [{ comment: regex }, { serviceName: regex }, { location: regex }]
  }

  const [reviews, total] = await Promise.all([
    Review.find(filter)
      .sort({ isFeaturedStory: -1, rating: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('customer', 'name profileImage')
      .populate('artist', 'name profileImage')
      .populate('service', 'name')
      .lean(),
    Review.countDocuments(filter),
  ])

  const artistIds = Array.from(
    new Set(
      reviews
        .map((r) => {
          const a = r.artist as unknown as { _id?: Types.ObjectId } | null
          return a?._id ? String(a._id) : r.artist ? String(r.artist) : ''
        })
        .filter(Boolean)
    )
  )

  const artistProfiles = await ArtistProfile.find({
    user: { $in: artistIds.map((id) => new Types.ObjectId(id)) },
  })
    .select('user businessName city state portfolioImages')
    .lean()

  const profileMap = new Map(artistProfiles.map((ap) => [String(ap.user), ap]))

  const stories = reviews.map((rev) => {
    const customerObj = rev.customer as unknown as {
      _id?: Types.ObjectId
      name?: string
      profileImage?: string
    } | null
    const artistObj = rev.artist as unknown as {
      _id?: Types.ObjectId
      name?: string
      profileImage?: string
    } | null
    const serviceObj = rev.service as unknown as {
      _id?: Types.ObjectId
      name?: string
    } | null

    const artistIdStr = artistObj?._id ? String(artistObj._id) : String(rev.artist || '')
    const artistProf = profileMap.get(artistIdStr)

    const resolvedServiceName = rev.serviceName || serviceObj?.name || 'Beauty Service'
    const resolvedLocation =
      rev.location ||
      [artistProf?.city, artistProf?.state].filter(Boolean).join(', ') ||
      'Australia'

    const coverImage =
      rev.afterImage ||
      rev.images?.[0] ||
      rev.beforeImage ||
      customerObj?.profileImage ||
      artistProf?.portfolioImages?.[0] ||
      null

    return {
      _id: rev._id,
      reviewNumber: rev.reviewNumber || null,
      coverImage,
      rating: rev.rating,
      ratingText: Number(rev.rating).toFixed(1),
      quote: rev.comment || '',
      comment: rev.comment || '',
      tags: rev.tags || [],
      customerName: customerObj?.name || 'Verified Customer',
      customer: {
        _id: customerObj?._id || null,
        name: customerObj?.name || 'Verified Customer',
        profileImage: customerObj?.profileImage || null,
      },
      artist: {
        _id: artistObj?._id || null,
        name: artistObj?.name || artistProf?.businessName || 'Beauty Artist',
        businessName: artistProf?.businessName || artistObj?.name || 'Beauty Artist',
        profileImage: artistObj?.profileImage || null,
      },
      location: resolvedLocation,
      serviceName: resolvedServiceName,
      subtitle: [resolvedLocation, resolvedServiceName].filter(Boolean).join(' · '),
      hasBeforeAndAfter: Boolean(rev.beforeImage && rev.afterImage),
      beforeImage: rev.beforeImage || null,
      afterImage: rev.afterImage || null,
      images: rev.images || [],
      isVerifiedBooking: rev.isVerifiedBooking ?? true,
      isFeaturedStory: rev.isFeaturedStory ?? false,
      formattedDate: moment(rev.createdAt).format('MMMM D, YYYY'),
      createdAt: rev.createdAt,
    }
  })

  return {
    stories,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  }
}

/**
 * Get Single Customer Story Detail + Related Stories (Figma customer/10.png)
 */
const getCustomerStoryById = async (storyId: string) => {
  validateObjectId(storyId, 'storyId')

  const rev = await Review.findOne({
    _id: new Types.ObjectId(storyId),
    isActive: true,
  })
    .populate('customer', 'name profileImage')
    .populate('artist', 'name profileImage')
    .populate('service', 'name')
    .lean()

  if (!rev) {
    throw new AppError(httpStatus.NOT_FOUND, 'Customer story not found')
  }

  const customerObj = rev.customer as unknown as {
    _id?: Types.ObjectId
    name?: string
    profileImage?: string
  } | null
  const artistObj = rev.artist as unknown as {
    _id?: Types.ObjectId
    name?: string
    profileImage?: string
  } | null
  const serviceObj = rev.service as unknown as {
    _id?: Types.ObjectId
    name?: string
  } | null

  const artistProf = artistObj?._id
    ? await ArtistProfile.findOne({ user: artistObj._id })
        .select('businessName city state portfolioImages')
        .lean()
    : null

  const resolvedServiceName = rev.serviceName || serviceObj?.name || 'Beauty Service'
  const resolvedLocation =
    rev.location ||
    [artistProf?.city, artistProf?.state].filter(Boolean).join(', ') ||
    'Australia'

  const heroImage =
    rev.afterImage ||
    rev.images?.[0] ||
    rev.beforeImage ||
    customerObj?.profileImage ||
    artistProf?.portfolioImages?.[0] ||
    null

  const photoGallery = Array.from(
    new Set([
      ...(rev.images || []),
      ...(rev.afterImage ? [rev.afterImage] : []),
      ...(rev.beforeImage ? [rev.beforeImage] : []),
    ])
  )

  // Fetch Related Stories (Figma customer/10.png bottom section)
  const relatedDocs = await Review.find({
    _id: { $ne: rev._id },
    isActive: true,
    moderationStatus: {
      $nin: [REVIEW_MODERATION_STATUS.HIDDEN, REVIEW_MODERATION_STATUS.REMOVED],
    },
  })
    .sort({ isFeaturedStory: -1, rating: -1, createdAt: -1 })
    .limit(6)
    .populate('customer', 'name profileImage')
    .populate('service', 'name')
    .lean()

  const relatedStories = relatedDocs.map((rel) => {
    const relCust = rel.customer as unknown as {
      _id?: Types.ObjectId
      name?: string
      profileImage?: string
    } | null
    const relSvc = rel.service as unknown as { name?: string } | null
    const fullName = relCust?.name || 'Customer'
    const parts = fullName.trim().split(/\s+/)
    const shortName =
      parts.length > 1 ? `${parts[0]} ${parts[1]![0]?.toUpperCase()}.` : fullName

    return {
      _id: rel._id,
      coverImage: rel.afterImage || rel.images?.[0] || rel.beforeImage || relCust?.profileImage || null,
      customerName: shortName,
      serviceName: rel.serviceName || relSvc?.name || 'Beauty Service',
      rating: rel.rating,
      createdAt: rel.createdAt,
    }
  })

  return {
    story: {
      _id: rev._id,
      reviewNumber: rev.reviewNumber || null,
      heroImage,
      badge: rev.isVerifiedBooking !== false ? 'Verified Booking' : null,
      isVerifiedBooking: rev.isVerifiedBooking ?? true,
      customerName: customerObj?.name || 'Verified Customer',
      customer: {
        _id: customerObj?._id || null,
        name: customerObj?.name || 'Verified Customer',
        profileImage: customerObj?.profileImage || null,
      },
      artist: {
        _id: artistObj?._id || null,
        name: artistObj?.name || artistProf?.businessName || 'Beauty Artist',
        businessName: artistProf?.businessName || artistObj?.name || 'Beauty Artist',
        profileImage: artistObj?.profileImage || null,
      },
      rating: rev.rating,
      serviceName: resolvedServiceName,
      location: resolvedLocation,
      formattedDate: moment(rev.createdAt).format('MMMM D, YYYY'),
      tags: rev.tags || [],
      writtenReview: rev.comment || '',
      comment: rev.comment || '',
      beforeAndAfter: {
        hasBeforeAndAfter: Boolean(rev.beforeImage && rev.afterImage),
        beforeImage: rev.beforeImage || null,
        afterImage: rev.afterImage || null,
      },
      photoGallery,
      images: rev.images || [],
      artistReply: rev.artistReply || null,
      createdAt: rev.createdAt,
    },
    relatedStories,
  }
}

/**
 * Get all reviews for a specific Artist (with rating breakdown & default 0 rating if none)
 */
const getArtistReviews = async (
  artistId: string,
  query: { page?: string | number | undefined; limit?: string | number | undefined; rating?: string | number | undefined }
) => {
  validateObjectId(artistId, 'artistId')

  // Support passing either User._id or ArtistProfile._id
  let artistUserId = new Types.ObjectId(artistId)
  const profileByDocId = await ArtistProfile.findById(artistId).select('user').lean()
  if (profileByDocId?.user) {
    artistUserId = new Types.ObjectId(String(profileByDocId.user))
  }

  const page = Math.max(1, Number(query.page) || 1)
  const limit = Math.min(50, Math.max(1, Number(query.limit) || 10))
  const skip = (page - 1) * limit

  const baseMatch: Record<string, unknown> = {
    artist: artistUserId,
    isActive: true,
    moderationStatus: {
      $nin: [REVIEW_MODERATION_STATUS.HIDDEN, REVIEW_MODERATION_STATUS.REMOVED],
    },
  }

  const listMatch: Record<string, unknown> = { ...baseMatch }
  if (query.rating !== undefined && query.rating !== '') {
    listMatch.rating = Number(query.rating)
  }

  const [statsAgg, breakdownAgg, reviews, total] = await Promise.all([
    Review.aggregate([
      { $match: baseMatch },
      {
        $group: {
          _id: null,
          avgRating: { $avg: '$rating' },
          totalReviews: { $sum: 1 },
        },
      },
    ]),
    Review.aggregate([
      { $match: baseMatch },
      {
        $group: {
          _id: '$rating',
          count: { $sum: 1 },
        },
      },
    ]),
    Review.find(listMatch)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('customer', 'name profileImage')
      .populate('service', 'name')
      .lean(),
    Review.countDocuments(listMatch),
  ])

  const totalReviews = statsAgg[0]?.totalReviews || 0
  // Default to 0 when there are no reviews!
  const avgRating =
    totalReviews > 0 && statsAgg[0]?.avgRating
      ? Math.round(statsAgg[0].avgRating * 10) / 10
      : 0

  const ratingBreakdown: Record<number, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }
  for (const item of breakdownAgg) {
    const r = Math.round(Number(item._id))
    if (r >= 1 && r <= 5) {
      ratingBreakdown[r] = item.count
    }
  }

  const formattedReviews = reviews.map((rev) => {
    const cust = rev.customer as unknown as {
      _id?: Types.ObjectId
      name?: string
      profileImage?: string
    } | null
    const svc = rev.service as unknown as { _id?: Types.ObjectId; name?: string } | null
    const custName = cust?.name || 'Customer'

    return {
      _id: rev._id,
      reviewNumber: rev.reviewNumber || null,
      rating: rev.rating,
      tags: rev.tags || [],
      comment: rev.comment || '',
      serviceName: rev.serviceName || svc?.name || null,
      beforeImage: rev.beforeImage || null,
      afterImage: rev.afterImage || null,
      images: rev.images || [],
      artistReply: rev.artistReply || null,
      isVerifiedBooking: rev.isVerifiedBooking ?? true,
      timeAgo: moment(rev.createdAt).fromNow(),
      createdAt: rev.createdAt,
      customer: {
        _id: cust?._id || null,
        name: custName,
        profileImage: cust?.profileImage || null,
        initial: custName.charAt(0).toUpperCase(),
      },
    }
  })

  return {
    summary: {
      avgRating,
      totalReviews,
      ratingBreakdown,
    },
    reviews: formattedReviews,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  }
}

/**
 * Get Review & Screen Info for a specific Booking (Figma customer/23.png & Artist/19.png "View Review")
 */
const getReviewByBooking = async (user: IUser, bookingId: string) => {
  const query = Types.ObjectId.isValid(bookingId)
    ? { _id: new Types.ObjectId(bookingId) }
    : { bookingNumber: bookingId }

  const booking = await Booking.findOne(query)
    .populate('artist', 'name email profileImage')
    .populate('customer', 'name email profileImage')
    .populate('service', 'name durationMinutes price')
    .lean()

  if (!booking) {
    throw new AppError(httpStatus.NOT_FOUND, 'Booking not found')
  }

  const customerObj = booking.customer as unknown as { _id?: Types.ObjectId; name?: string; profileImage?: string }
  const artistObj = booking.artist as unknown as { _id?: Types.ObjectId; name?: string; profileImage?: string }
  const serviceObj = booking.service as unknown as { _id?: Types.ObjectId; name?: string }

  const isCustomer = String(customerObj?._id || booking.customer) === String(user._id)
  const isArtist = String(artistObj?._id || booking.artist) === String(user._id)
  const isAdmin = user.role === AuthRoles.ADMIN || user.role === AuthRoles.SUPER_ADMIN

  if (!isCustomer && !isArtist && !isAdmin) {
    throw new AppError(httpStatus.FORBIDDEN, 'You do not have access to this booking review')
  }

  const artistUserId = artistObj?._id || booking.artist
  const [artistProfile, artistStats, existingReview] = await Promise.all([
    ArtistProfile.findOne({ user: artistUserId }).select('businessName').lean(),
    Review.aggregate([
      {
        $match: {
          artist: new Types.ObjectId(String(artistUserId)),
          isActive: true,
        },
      },
      {
        $group: {
          _id: null,
          avgRating: { $avg: '$rating' },
          totalReviews: { $sum: 1 },
        },
      },
    ]),
    Review.findOne({ booking: booking._id })
      .populate('customer', 'name profileImage')
      .populate('artist', 'name profileImage')
      .lean(),
  ])

  const artistTotalReviews = artistStats[0]?.totalReviews || 0
  // Default to 0 when artist has no reviews!
  const artistAvgRating =
    artistTotalReviews > 0 && artistStats[0]?.avgRating
      ? Math.round(artistStats[0].avgRating * 10) / 10
      : 0

  return {
    bookingSummary: {
      _id: booking._id,
      bookingNumber: booking.bookingNumber,
      status: booking.status,
      bookingDate: booking.bookingDate,
      formattedDate: moment(booking.bookingDate).format('ddd, D MMM YYYY'),
      startTime: booking.startTime,
      serviceName: serviceObj?.name || 'Beauty Service',
      artist: {
        _id: artistObj?._id || booking.artist,
        name: artistObj?.name || artistProfile?.businessName || 'Artist',
        businessName: artistProfile?.businessName || artistObj?.name || 'Artist',
        profileImage: artistObj?.profileImage || null,
        rating: artistAvgRating,
        reviewsCount: artistTotalReviews,
      },
    },
    tagOptions: REVIEW_TAG_OPTIONS,
    hasReviewed: Boolean(existingReview),
    review: existingReview || null,
  }
}

/**
 * Get current user's reviews (Customer: written reviews, Artist: received reviews)
 */
const getMyReviews = async (
  user: IUser,
  query: { page?: string | number | undefined; limit?: string | number | undefined }
) => {
  const page = Math.max(1, Number(query.page) || 1)
  const limit = Math.min(50, Math.max(1, Number(query.limit) || 10))
  const skip = (page - 1) * limit

  const filter: Record<string, unknown> =
    user.role === AuthRoles.ARTIST
      ? { artist: user._id, isActive: true }
      : { customer: user._id, isActive: true }

  const [reviews, total] = await Promise.all([
    Review.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('customer', 'name profileImage')
      .populate('artist', 'name profileImage')
      .populate('booking', 'bookingNumber bookingDate startTime status')
      .populate('service', 'name')
      .lean(),
    Review.countDocuments(filter),
  ])

  return {
    reviews,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  }
}

/**
 * Artist replies to a customer review
 */
const replyToReview = async (user: IUser, reviewId: string, comment: string) => {
  validateObjectId(reviewId, 'reviewId')

  const review = await Review.findById(reviewId)
  if (!review || !review.isActive) {
    throw new AppError(httpStatus.NOT_FOUND, 'Review not found')
  }

  if (String(review.artist) !== String(user._id)) {
    throw new AppError(httpStatus.FORBIDDEN, 'You can only reply to reviews on your own profile')
  }

  review.artistReply = {
    comment: comment.trim(),
    repliedAt: new Date(),
  }

  await review.save()
  return review
}

/**
 * Report a fake or inappropriate review (Figma customer/23.png "Report Fake Review" & Admin/11.png)
 */
const reportReview = async (
  user: IUser,
  reviewId: string,
  payload: { reason: string; isFakeReview?: boolean | undefined }
) => {
  validateObjectId(reviewId, 'reviewId')

  const review = await Review.findById(reviewId)
  if (!review) {
    throw new AppError(httpStatus.NOT_FOUND, 'Review not found')
  }

  const alreadyReported = (review.reports || []).some(
    (r) => String(r.reportedBy) === String(user._id)
  )
  if (alreadyReported) {
    throw new AppError(httpStatus.BAD_REQUEST, 'You have already reported this review')
  }

  if (!review.reports) {
    review.reports = []
  }

  review.reports.push({
    reportedBy: new Types.ObjectId(String(user._id)),
    reason: payload.reason.trim(),
    isFakeReview: payload.isFakeReview ?? true,
    reportedAt: new Date(),
  })

  review.reportsCount = review.reports.length
  review.moderationStatus = REVIEW_MODERATION_STATUS.REPORTED
  if (payload.isFakeReview !== false) {
    review.isFakeFlagged = true
  }

  await review.save()

  return {
    _id: review._id,
    reviewNumber: review.reviewNumber,
    moderationStatus: review.moderationStatus,
    reportsCount: review.reportsCount,
    isFakeFlagged: review.isFakeFlagged,
  }
}

/**
 * Admin Review Moderation Dashboard & List (Figma Admin/11.png)
 */
const getAdminReviewModeration = async (query: {
  tab?: string | undefined
  sortBy?: string | undefined
  searchTerm?: string | undefined
  page?: string | number | undefined
  limit?: string | number | undefined
}) => {
  const page = Math.max(1, Number(query.page) || 1)
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 10))
  const skip = (page - 1) * limit

  const oneWeekAgo = moment().subtract(7, 'days').toDate()

  // 1. Dashboard Summary Stats (Total Reviews, +this week, Pending Reports, Avg. Rating default 0)
  const [totalReviews, newReviewsThisWeek, pendingReports, ratingAgg] = await Promise.all([
    Review.countDocuments({
      moderationStatus: { $ne: REVIEW_MODERATION_STATUS.REMOVED },
    }),
    Review.countDocuments({
      createdAt: { $gte: oneWeekAgo },
      moderationStatus: { $ne: REVIEW_MODERATION_STATUS.REMOVED },
    }),
    Review.countDocuments({
      $or: [
        { moderationStatus: REVIEW_MODERATION_STATUS.REPORTED },
        { moderationStatus: REVIEW_MODERATION_STATUS.PENDING },
        { reportsCount: { $gt: 0 }, moderationStatus: { $ne: REVIEW_MODERATION_STATUS.RESOLVED } },
      ],
    }),
    Review.aggregate([
      {
        $match: {
          isActive: true,
          moderationStatus: {
            $nin: [REVIEW_MODERATION_STATUS.HIDDEN, REVIEW_MODERATION_STATUS.REMOVED],
          },
        },
      },
      {
        $group: {
          _id: null,
          avgRating: { $avg: '$rating' },
        },
      },
    ]),
  ])

  const platformAvgRating = ratingAgg[0]?.avgRating
    ? Number(ratingAgg[0].avgRating.toFixed(1))
    : 0

  // 2. Filter by Tab: 'all' | 'reported' | 'fake' | 'pending' | 'resolved' | 'hidden'
  const tab = (query.tab || 'all').toLowerCase()
  const filter: Record<string, unknown> = {}

  if (tab === 'reported') {
    filter.$or = [
      { moderationStatus: REVIEW_MODERATION_STATUS.REPORTED },
      { reportsCount: { $gt: 0 } },
    ]
  } else if (tab === 'fake' || tab === 'fake_reviews') {
    filter.isFakeFlagged = true
  } else if (tab === 'pending') {
    filter.moderationStatus = REVIEW_MODERATION_STATUS.PENDING
  } else if (tab === 'resolved') {
    filter.moderationStatus = REVIEW_MODERATION_STATUS.RESOLVED
  } else if (tab === 'hidden') {
    filter.moderationStatus = REVIEW_MODERATION_STATUS.HIDDEN
  } else {
    filter.moderationStatus = { $ne: REVIEW_MODERATION_STATUS.REMOVED }
  }

  if (query.searchTerm?.trim()) {
    const regex = new RegExp(query.searchTerm.trim(), 'i')
    filter.$or = [
      { reviewNumber: regex },
      { comment: regex },
      { serviceName: regex },
    ]
  }

  // 3. Sorting: 'newest' | 'lowest_rating' | 'highest_rating'
  let sortStage: Record<string, 1 | -1> = { createdAt: -1 }
  if (query.sortBy === 'lowest_rating') {
    sortStage = { rating: 1, createdAt: -1 }
  } else if (query.sortBy === 'highest_rating') {
    sortStage = { rating: -1, createdAt: -1 }
  }

  const [reviews, filteredTotal] = await Promise.all([
    Review.find(filter)
      .sort(sortStage)
      .skip(skip)
      .limit(limit)
      .populate('customer', 'name email profileImage status')
      .populate('artist', 'name email profileImage')
      .populate('booking', 'bookingNumber bookingDate')
      .lean(),
    Review.countDocuments(filter),
  ])

  const artistIds = Array.from(
    new Set(
      reviews
        .map((r) => {
          const a = r.artist as unknown as { _id?: Types.ObjectId } | null
          return a?._id ? String(a._id) : ''
        })
        .filter(Boolean)
    )
  )

  const artistProfiles = await ArtistProfile.find({
    user: { $in: artistIds.map((id) => new Types.ObjectId(id)) },
  })
    .select('user businessName')
    .lean()

  const profileMap = new Map(artistProfiles.map((ap) => [String(ap.user), ap]))

  const formattedReviews = reviews.map((rev, idx) => {
    const cust = rev.customer as unknown as {
      _id?: Types.ObjectId
      name?: string
      email?: string
      profileImage?: string
      status?: string
    } | null
    const art = rev.artist as unknown as {
      _id?: Types.ObjectId
      name?: string
      email?: string
      profileImage?: string
    } | null
    const bk = rev.booking as unknown as {
      _id?: Types.ObjectId
      bookingNumber?: string
    } | null

    const artProfile = art?._id ? profileMap.get(String(art._id)) : null
    const snippet =
      rev.comment && rev.comment.length > 40
        ? `${rev.comment.slice(0, 40)}...`
        : rev.comment || '—'

    return {
      _id: rev._id,
      reviewId: rev.reviewNumber || `REV-${1000 + idx + 1}`,
      customer: {
        _id: cust?._id || null,
        name: cust?.name || 'Customer',
        initials: getInitials(cust?.name),
        email: cust?.email || null,
        profileImage: cust?.profileImage || null,
        status: cust?.status || null,
        bookingNumber: bk?.bookingNumber || null,
      },
      artist: {
        _id: art?._id || null,
        name: art?.name || 'Artist',
        businessName: artProfile?.businessName || art?.name || 'Beauty Artist',
        initials: getInitials(artProfile?.businessName || art?.name),
        profileImage: art?.profileImage || null,
      },
      bookingNumber: bk?.bookingNumber || null,
      serviceName: rev.serviceName || 'Beauty Service',
      rating: rev.rating,
      tags: rev.tags || [],
      snippet,
      comment: rev.comment || '',
      beforeImage: rev.beforeImage || null,
      afterImage: rev.afterImage || null,
      images: rev.images || [],
      reportsCount: rev.reportsCount || 0,
      reports: rev.reports || [],
      isFakeFlagged: rev.isFakeFlagged || false,
      isFeaturedStory: rev.isFeaturedStory || false,
      status: rev.moderationStatus || REVIEW_MODERATION_STATUS.APPROVED,
      isActive: rev.isActive ?? true,
      formattedDate: moment(rev.createdAt).format('MMM D, YYYY'),
      createdAt: rev.createdAt,
    }
  })

  return {
    stats: {
      totalReviews,
      newReviewsThisWeek,
      pendingReports,
      avgRating: platformAvgRating,
    },
    reviews: formattedReviews,
    meta: {
      page,
      limit,
      total: filteredTotal,
      totalPages: Math.ceil(filteredTotal / limit) || 1,
      tab,
    },
  }
}

/**
 * Admin Moderation Actions on a Review (Figma Admin/11.png right-side panel):
 * - approve ("Approve Review")
 * - hide ("Hide Review")
 * - remove ("Remove Review")
 * - warn_user ("Warn User")
 * - suspend_reviewer ("Suspend Reviewer")
 * - feature_story / unfeature_story (Pin/unpin from Customer Stories)
 */
const performAdminReviewAction = async (
  reviewId: string,
  action: TAdminReviewAction,
  note?: string
) => {
  const query = Types.ObjectId.isValid(reviewId)
    ? { _id: new Types.ObjectId(reviewId) }
    : { reviewNumber: reviewId }

  const review = await Review.findOne(query)
  if (!review) {
    throw new AppError(httpStatus.NOT_FOUND, 'Review not found')
  }

  let actionMessage = 'Review updated successfully'

  switch (action) {
    case ADMIN_REVIEW_ACTION.APPROVE:
      review.moderationStatus =
        (review.reportsCount || 0) > 0
          ? REVIEW_MODERATION_STATUS.RESOLVED
          : REVIEW_MODERATION_STATUS.APPROVED
      review.isFakeFlagged = false
      review.isActive = true
      actionMessage = 'Review approved and published'
      break

    case ADMIN_REVIEW_ACTION.HIDE:
      review.moderationStatus = REVIEW_MODERATION_STATUS.HIDDEN
      review.isActive = false
      review.isFeaturedStory = false
      actionMessage = 'Review hidden from public view'
      break

    case ADMIN_REVIEW_ACTION.REMOVE:
      review.moderationStatus = REVIEW_MODERATION_STATUS.REMOVED
      review.isActive = false
      review.isFeaturedStory = false
      actionMessage = 'Review removed permanently from public view'
      break

    case ADMIN_REVIEW_ACTION.WARN_USER:
      review.adminWarningCount = (review.adminWarningCount || 0) + 1
      actionMessage = 'Warning recorded for reviewer'
      break

    case ADMIN_REVIEW_ACTION.SUSPEND_REVIEWER:
      await User.findByIdAndUpdate(review.customer, {
        status: AuthStatus.SUSPENDED,
        blockedReason: note || 'Suspended by admin due to review policy violation',
      })
      review.moderationStatus = REVIEW_MODERATION_STATUS.REMOVED
      review.isActive = false
      review.isFeaturedStory = false
      actionMessage = 'Reviewer account has been suspended and review removed'
      break

    case ADMIN_REVIEW_ACTION.FEATURE_STORY:
      review.isFeaturedStory = true
      review.isActive = true
      if (
        review.moderationStatus === REVIEW_MODERATION_STATUS.HIDDEN ||
        review.moderationStatus === REVIEW_MODERATION_STATUS.REMOVED
      ) {
        review.moderationStatus = REVIEW_MODERATION_STATUS.APPROVED
      }
      actionMessage = 'Review featured in Customer Stories'
      break

    case ADMIN_REVIEW_ACTION.UNFEATURE_STORY:
      review.isFeaturedStory = false
      actionMessage = 'Review removed from featured Customer Stories'
      break

    default:
      throw new AppError(httpStatus.BAD_REQUEST, `Unsupported admin action: ${String(action)}`)
  }

  await review.save()

  return {
    message: actionMessage,
    review,
  }
}

export const reviewServices = {
  uploadReviewImages,
  createReview,
  getCustomerStories,
  getCustomerStoryById,
  getArtistReviews,
  getReviewByBooking,
  getMyReviews,
  replyToReview,
  reportReview,
  getAdminReviewModeration,
  performAdminReviewAction,
}

