import { Schema, model } from 'mongoose'
import type { IBugReportDoc } from './bug-report.interfaces'
import { BUG_STATUS, BUG_STATUS_VALUES } from './bug-report.constants'

const bugReportSchema = new Schema<IBugReportDoc>(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    reportedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    booking: {
      type: Schema.Types.ObjectId,
      ref: 'Booking',
      default: null,
    },
    attachments: {
      type: [String],
      default: [],
    },
    deviceInfo: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: BUG_STATUS_VALUES,
      default: BUG_STATUS.PENDING,
      index: true,
    },
    adminNote: {
      type: String,
      trim: true,
      default: null,
    },
    resolvedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
)

export const BugReport = model<IBugReportDoc>('BugReport', bugReportSchema)

