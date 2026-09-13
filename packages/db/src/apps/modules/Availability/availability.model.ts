import { Schema, model } from 'mongoose'
import type { IAvailabilityDoc, IWorkingDay } from './availability.interfaces'
import { REPETITION_TYPES, repetitionTypeValues } from './availability.constants'

const createDefaultDay = (isWorking = true, start = '09:00', end = '18:00'): IWorkingDay => ({
  isWorkingDay: isWorking,
  startTime: start,
  endTime: end,
  breakStartTime: null,
  breakEndTime: null,
})

// Working Day Schema:
const workingDaySchema = new Schema<IWorkingDay>(
  {
    isWorkingDay: {
      type: Boolean,
      required: true,
      default: true,
    },
    startTime: {
      type: String,
      default: '09:00',
    },
    endTime: {
      type: String,
      default: '18:00',
    },
    breakStartTime: {
      type: String,
      default: null,
    },
    breakEndTime: {
      type: String,
      default: null,
    },
  },
  {
    _id: false,
    versionKey: false,
  }
)

const availabilitySchema = new Schema<IAvailabilityDoc>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      unique: true,
      index: true,
      required: true,
    },
    timezone: {
      type: String,
      required: true,
      default: 'Australia/Sydney',
    },
    weeklySchedule: {
      monday: {
        type: workingDaySchema,
        default: createDefaultDay(),
      },
      tuesday: {
        type: workingDaySchema,
        default: createDefaultDay(),
      },
      wednesday: {
        type: workingDaySchema,
        default: createDefaultDay(),
      },
      thursday: {
        type: workingDaySchema,
        default: createDefaultDay(),
      },
      friday: {
        type: workingDaySchema,
        default: createDefaultDay(),
      },
      saturday: {
        type: workingDaySchema,
        default: createDefaultDay(),
      },
      sunday: {
        type: workingDaySchema,
        default: createDefaultDay(),
      },
    },
    isVacationEnabled: {
      type: Boolean,
      required: true,
      default: false,
    },
    vacationStartDate: {
      type: Date,
      default: null,
    },
    vacationEndDate: {
      type: Date,
      default: null,
    },
    vacationMessage: {
      type: String,
    },
    isQuickBookingEnabled: {
      type: Boolean,
      required: true,
      default: false,
    },
    minNotice: {
      type: Number, // hour
      required: true,
      default: 2,
    },
    bufferTime: {
      type: Number, // min
      required: true,
      default: 30,
    },
    maxBookingPerDay: {
      type: Number,
      required: true,
      default: 8,
    },
    repetitionType: {
      type: String,
      enum: repetitionTypeValues,
      default: REPETITION_TYPES.WEEKLY,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
)

// Static method
// availabilitySchema.statics.getById = async function (id: string) {
//   return this.findById(id)
// }

export const Availability = model<IAvailabilityDoc>('Availability', availabilitySchema)
