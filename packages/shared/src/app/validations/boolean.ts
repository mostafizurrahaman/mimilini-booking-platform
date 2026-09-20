import z from 'zod'

export const requiredStrBoolean = (fieldName: string) =>
  z.union(
    [
      z.boolean({
        error: `${fieldName} must be true/false`,
      }),
      z
        .string()
        .refine(
          (val) => {
            if (val?.trim()?.toLowerCase() === 'true') return true
            if (val?.trim()?.toLowerCase() === 'false') return true
          },
          {
            error: `${fieldName} must be true/false`,
          }
        )
        .transform((val, ctx) => {
          const boolVal = val?.trim()?.toLowerCase()
          if (boolVal === 'true') return true
          if (boolVal === 'false') return false

          ctx.addIssue({
            code: 'custom',
            message: `${fieldName} must be true/false`,
          })
        }),
    ],
    {
      error: `${fieldName} must be true/false`,
    }
  )
