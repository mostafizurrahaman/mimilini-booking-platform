import { Document, Types } from 'mongoose'
import type { TBannerPriorityStatus, TBannerStatusType } from './banner.constants'

export interface IBanner {
  title: string
  subtitle: string
  url: string
  ctaBtnText: string
  ctaDestination: string
  startDate: Date
  endDate: Date
  priority: TBannerPriorityStatus
  status: TBannerStatusType
  user: Types.ObjectId
}

export interface IBannerDoc extends Document, IBanner {}

// export interface IBannerModel extends Model<IBannerDoc> {
//   getById(id: string): Promise<IBanner | null>
// }
