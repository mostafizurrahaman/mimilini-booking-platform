import type { UploadedFile } from '../../types'
import { senitizeFileName } from '../sanitize-file-name'
import { s3Client } from '../../configs/aws.config'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import httpStatus from 'http-status'
import { AppError } from '@repo/shared'

export const uploadSingleFileToS3 = async (
  file: Express.Multer.File,
  folder: string
): Promise<UploadedFile> => {
  try {
    const key = senitizeFileName(file, folder)

    const awsUrl = `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com`

    await s3Client.send(
      new PutObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET_NAME as string,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
        ContentDisposition: 'inline',
        ACL: 'public-read',
      })
    )

    return {
      key,
      url: `${awsUrl}/${key}`,
      provider: 'aws',
    }
  } catch (error) {
    console.log(error)
    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Failed to upload file to S3: ${(error as Error).message}`
    )
  }
}
