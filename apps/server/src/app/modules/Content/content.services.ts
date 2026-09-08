import { Content, type TContentType } from '@repo/db'
import httpStatus from 'http-status'
import { AppError } from '@repo/shared'

const updateContentType = async (type: TContentType, content: string) => {
  const result = await Content.findOneAndUpdate(
    {
      type,
    },
    {
      content,
    },
    {
      upsert: true,
      returnDocument: 'after',
      runValidators: true,
    }
  )

  if (!result) {
    throw new AppError(httpStatus.BAD_REQUEST, `Failed to update  ${type}`)
  }

  return result
}

const getContentByType = async (type: TContentType) => {
  const result = await Content.findOne({
    type,
  })

  return result
}

export const contentServices = {
  updateContentType,

  getContentByType,
}
