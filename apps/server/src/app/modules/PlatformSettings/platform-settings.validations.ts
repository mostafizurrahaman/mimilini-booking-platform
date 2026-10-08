import z from 'zod'
import {
  optionalString,
  rangedNumber,
  requiredNumber,
  positiveNumber,
  optionalNumber,
} from '@repo/shared'

const cancellationFeeTierSchema = z.object({
  moreThan14Days: requiredNumber('Cancellation fee for more than 14 days').min(
    0,
    'Cancellation fee cannot be negative'
  ),
  sevenTo13Days: requiredNumber('Cancellation fee for 7-13 days').min(
    0,
    'Cancellation fee cannot be negative'
  ),
  within48Hours: requiredNumber('Cancellation fee within 48 hours').min(
    0,
    'Cancellation fee cannot be negative'
  ),
})

const updateCancellationFeeTierSchema = z
  .object({
    moreThan14Days: optionalNumber('Cancellation fee for more than 14 days').refine(
      (v) => v === undefined || v >= 0,
      { message: 'Cancellation fee cannot be negative' }
    ),
    sevenTo13Days: optionalNumber('Cancellation fee for 7-13 days').refine(
      (v) => v === undefined || v >= 0,
      { message: 'Cancellation fee cannot be negative' }
    ),
    within48Hours: optionalNumber('Cancellation fee within 48 hours').refine(
      (v) => v === undefined || v >= 0,
      { message: 'Cancellation fee cannot be negative' }
    ),
  })
  .partial()

const createPlatformSettingsSchema = z.object({
  body: z
    .object({
      platformPercentage: rangedNumber('Platform percentage', 0, 100),
      gstPercentage: rangedNumber('GST percentage', 0, 100),
      travelingFeePerKm: requiredNumber('Traveling fee per km').min(
        0,
        'Traveling fee per km cannot be negative'
      ),
      parkingFee: requiredNumber('Parking fee').min(
        0,
        'Parking fee cannot be negative'
      ),
      peakTimeSurcharge: requiredNumber('Peak time surcharge').min(
        0,
        'Peak time surcharge cannot be negative'
      ),
      lowMaxAmount: positiveNumber('Low tier max amount'),
      mediumMaxAmount: positiveNumber('Medium tier max amount'),
      low: cancellationFeeTierSchema,
      medium: cancellationFeeTierSchema,
      high: cancellationFeeTierSchema,
    })
    .superRefine((data, ctx) => {
      if (data.mediumMaxAmount <= data.lowMaxAmount) {
        ctx.addIssue({
          code: 'custom',
          path: ['mediumMaxAmount'],
          message: 'Medium tier max amount must be strictly greater than low tier max amount',
        })
      }
    }),
})

const updatePlatformSettingsSchema = z.object({
  params: z.object({
    id: optionalString('ID'),
  }),
  body: z
    .object({
      platformPercentage: rangedNumber('Platform percentage', 0, 100).optional(),
      gstPercentage: rangedNumber('GST percentage', 0, 100).optional(),
      travelingFeePerKm: optionalNumber('Traveling fee per km').refine(
        (v) => v === undefined || v >= 0,
        { message: 'Traveling fee per km cannot be negative' }
      ),
      parkingFee: optionalNumber('Parking fee').refine(
        (v) => v === undefined || v >= 0,
        { message: 'Parking fee cannot be negative' }
      ),
      peakTimeSurcharge: optionalNumber('Peak time surcharge').refine(
        (v) => v === undefined || v >= 0,
        { message: 'Peak time surcharge cannot be negative' }
      ),
      lowMaxAmount: optionalNumber('Low tier max amount').refine(
        (v) => v === undefined || v > 0,
        { message: 'Low tier max amount must be greater than 0' }
      ),
      mediumMaxAmount: optionalNumber('Medium tier max amount').refine(
        (v) => v === undefined || v > 0,
        { message: 'Medium tier max amount must be greater than 0' }
      ),
      low: updateCancellationFeeTierSchema.optional(),
      medium: updateCancellationFeeTierSchema.optional(),
      high: updateCancellationFeeTierSchema.optional(),
    })
    .superRefine((data, ctx) => {
      // Ensure body has at least one field to update
      const validKeys = Object.entries(data).filter(
        ([, value]) => value !== undefined
      )
      if (validKeys.length === 0) {
        ctx.addIssue({
          code: 'custom',
          path: [],
          message: 'At least one field must be provided to update',
        })
      }

      if (
        data.lowMaxAmount !== undefined &&
        data.mediumMaxAmount !== undefined &&
        data.mediumMaxAmount <= data.lowMaxAmount
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['mediumMaxAmount'],
          message: 'Medium tier max amount must be strictly greater than low tier max amount',
        })
      }
    }),
})

const getPlatformSettingsSchema = z.object({
  params: z.object({
    id: optionalString('ID'),
  }),
})

export const platformSettingsValidations = {
  createPlatformSettingsSchema,
  updatePlatformSettingsSchema,
  getPlatformSettingsSchema,
}

export type TCreatePlatformSettingsPayloadType = z.infer<
  typeof createPlatformSettingsSchema.shape.body
>
export type TUpdatePlatformSettingsPayloadType = z.infer<
  typeof updatePlatformSettingsSchema.shape.body
>
export type TGetPlatformSettingsParamsType = z.infer<
  typeof getPlatformSettingsSchema.shape.params
>
