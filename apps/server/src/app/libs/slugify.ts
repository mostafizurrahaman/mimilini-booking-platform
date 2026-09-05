import slugify from 'slugify'

export const getSlug = (val: string): string => {
  return slugify(val, {
    lower: true,
    trim: true,
    strict: true,
  })
}
