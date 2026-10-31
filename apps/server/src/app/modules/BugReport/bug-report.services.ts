import { Types, isValidObjectId } from 'mongoose'
import httpStatus from 'http-status'
import { AppError } from '@repo/shared'
import {
  BugReport,
  Booking,
  User,
  BUG_STATUS,
  AuthRoles,
  type IUser,
  type TBugStatus,
} from '@repo/db'
import { uploadMultipleFileToS3 } from 'packages/media-hub/src'
import { AWS_FOLDER_NAMES } from '@app/libs/files_folder'

interface ICreateBugReportPayload {
  title: string
  description: string
  booking?: string
  attachments?: string[]
  deviceInfo?: string
}

/**
 * 1. Customer creates a bug report
 */
const createBugReport = async (
  user: IUser,
  payload: ICreateBugReportPayload,
  files?: Express.Multer.File[]
) => {
  const attachments: string[] = Array.isArray(payload.attachments) ? [...payload.attachments] : []

  if (files && files.length > 0) {
    const uploaded = await uploadMultipleFileToS3(files, AWS_FOLDER_NAMES.BugAttachments)
    if (uploaded && uploaded.length > 0) {
      attachments.push(...uploaded.map((u) => u.url))
    }
  }

  let bookingId: Types.ObjectId | null = null
  if (payload.booking) {
    if (isValidObjectId(payload.booking)) {
      bookingId = new Types.ObjectId(payload.booking)
    } else {
      // Allow passing bookingNumber (e.g. BK-2611-ABCD)
      const foundBooking = await Booking.findOne({ bookingNumber: payload.booking }).select('_id').lean()
      if (foundBooking) {
        bookingId = foundBooking._id as Types.ObjectId
      }
    }
  }

  const bug = await BugReport.create({
    title: payload.title.trim(),
    description: payload.description.trim(),
    reportedBy: user._id,
    ...(bookingId ? { booking: bookingId } : {}),
    attachments,
    ...(payload.deviceInfo ? { deviceInfo: payload.deviceInfo.trim() } : {}),
    status: BUG_STATUS.PENDING,
  })

  return await BugReport.findById(bug._id as Types.ObjectId)
    .populate('reportedBy', 'name email role profileImage')
    .populate('booking', 'bookingNumber status')
    .lean()
}

/**
 * 2. Get customer's own reported bugs
 */
const getMyBugReports = async (user: IUser, query: { page?: number; limit?: number } = {}) => {
  const page = query.page || 1
  const limit = query.limit || 10
  const skip = (page - 1) * limit

  const [bugs, total] = await Promise.all([
    BugReport.find({ reportedBy: user._id })
      .populate('booking', 'bookingNumber status')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    BugReport.countDocuments({ reportedBy: user._id }),
  ])

  return {
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
      totalPage: Math.ceil(total / limit) || 1,
    },
    data: bugs,
  }
}

/**
 * 3. Admin: Get all bug reports with status filter, search, and pagination
 */
const getAdminBugReports = async (query: {
  status?: TBugStatus
  searchTerm?: string
  page?: number
  limit?: number
} = {}) => {
  const page = query.page || 1
  const limit = query.limit || 10
  const skip = (page - 1) * limit

  const filter: Record<string, any> = {}

  if (query.status) {
    filter.status = query.status
  }

  if (query.searchTerm && query.searchTerm.trim()) {
    const term = query.searchTerm.trim()
    const matchingUsers = await User.find({
      $or: [
        { name: { $regex: term, $options: 'i' } },
        { email: { $regex: term, $options: 'i' } },
      ],
    }).select('_id').lean()

    const userIds = matchingUsers.map((u) => u._id)

    filter.$or = [
      { title: { $regex: term, $options: 'i' } },
      { description: { $regex: term, $options: 'i' } },
      { reportedBy: { $in: userIds } },
    ]
  }

  const [bugs, total, pendingCount, inProgressCount, resolvedCount, closedCount] = await Promise.all([
    BugReport.find(filter)
      .populate('reportedBy', 'name email role profileImage phone')
      .populate('booking', 'bookingNumber status totalBookingPrice')
      .populate('resolvedBy', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    BugReport.countDocuments(filter),
    BugReport.countDocuments({ status: BUG_STATUS.PENDING }),
    BugReport.countDocuments({ status: BUG_STATUS.IN_PROGRESS }),
    BugReport.countDocuments({ status: BUG_STATUS.RESOLVED }),
    BugReport.countDocuments({ status: BUG_STATUS.CLOSED }),
  ])

  return {
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
      totalPage: Math.ceil(total / limit) || 1,
    },
    metrics: {
      totalAll: pendingCount + inProgressCount + resolvedCount + closedCount,
      pending: pendingCount,
      inProgress: inProgressCount,
      resolved: resolvedCount,
      closed: closedCount,
    },
    data: bugs,
  }
}

/**
 * 4. Get a single bug report by ID
 */
const getBugReportById = async (id: string, user: IUser) => {
  if (!isValidObjectId(id)) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Invalid bug report ID')
  }

  const bug = await BugReport.findById(id)
    .populate('reportedBy', 'name email role profileImage phone')
    .populate('booking', 'bookingNumber status totalBookingPrice bookingDate')
    .populate('resolvedBy', 'name email')
    .lean()

  if (!bug) {
    throw new AppError(httpStatus.NOT_FOUND, 'Bug report not found')
  }

  // Security check: non-admin can only access their own bug report
  const isAdmin = user.role === AuthRoles.ADMIN || user.role === AuthRoles.SUPER_ADMIN
  if (!isAdmin && String(bug.reportedBy?._id || bug.reportedBy) !== String(user._id)) {
    throw new AppError(httpStatus.FORBIDDEN, 'You do not have permission to view this bug report')
  }

  return bug
}

/**
 * 5. Admin updates status & resolution note of a bug report
 */
const updateBugReportStatus = async (
  id: string,
  adminUser: IUser,
  payload: { status: TBugStatus; adminNote?: string }
) => {
  if (!isValidObjectId(id)) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Invalid bug report ID')
  }

  const bug = await BugReport.findById(id)
  if (!bug) {
    throw new AppError(httpStatus.NOT_FOUND, 'Bug report not found')
  }

  bug.status = payload.status
  if (payload.adminNote !== undefined) {
    bug.adminNote = payload.adminNote?.trim() || null
  }

  if (payload.status === BUG_STATUS.RESOLVED || payload.status === BUG_STATUS.CLOSED) {
    bug.resolvedBy = adminUser._id as Types.ObjectId
    bug.resolvedAt = new Date()
  }

  await bug.save()

  return await BugReport.findById(bug._id)
    .populate('reportedBy', 'name email role profileImage phone')
    .populate('booking', 'bookingNumber status')
    .populate('resolvedBy', 'name email')
    .lean()
}

export const bugReportServices = {
  createBugReport,
  getMyBugReports,
  getAdminBugReports,
  getBugReportById,
  updateBugReportStatus,
}
