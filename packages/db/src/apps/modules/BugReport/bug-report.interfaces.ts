import { Document, Types } from 'mongoose'
import type { TBugStatus } from './bug-report.constants'

export interface IBugReport {
  title: string
  description: string
  reportedBy: Types.ObjectId
  booking?: Types.ObjectId | null
  attachments?: string[]
  deviceInfo?: string | null
  status: TBugStatus
  adminNote?: string | null
  resolvedBy?: Types.ObjectId | null
  resolvedAt?: Date | null
  createdAt?: Date
  updatedAt?: Date
}

export interface IBugReportDoc extends Document, IBugReport {}
