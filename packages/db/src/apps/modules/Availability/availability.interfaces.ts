import { Document, Types } from 'mongoose'
import type { TDay, TRepeatType } from './availability.constants'

// ?? 1. IWorkingDay:
export interface IWorkingDay {
  isWorkingDay: boolean
  startTime?: string | null
  endTime?: string | null
  breakStartTime?: string | null
  breakEndTime?: string | null
}

// ? 2. Weekly Schedule:
export type IWeeklySchedule = {
  [day in TDay]: IWorkingDay
}

export interface IAvailability {
  user: Types.ObjectId
  timezone: string
  weeklySchedule: IWeeklySchedule
  // ?? Vacation fields:
  isVacationEnabled: boolean
  vacationStartDate?: Date | null
  vacationEndDate?: Date | null
  vacationMessage?: string | undefined | null

  // ?? Is Quick booking enabled:
  isQuickBookingEnabled: boolean // If enable client can book without your approval.
  minNotice: number // hour
  bufferTime: number // min
  maxBookingPerDay: number // slot count

  repetitionType: TRepeatType
}

export interface IAvailabilityDoc extends Document, IAvailability {}

// export interface IAvailabilityModel extends Model<IAvailabilityDoc> {
//   getById(id: string): Promise<IAvailability | null>
// }
