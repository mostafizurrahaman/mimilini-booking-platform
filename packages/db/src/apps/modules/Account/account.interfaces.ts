import { Document, Types } from 'mongoose'
import type { TAccountStatus, TCountry, TCurrency } from './account.constants'

export interface IAccount {
  user: Types.ObjectId
  account: string
  country: TCountry
  currency: TCurrency
  chargesEnabled: boolean
  payoutsEnabled: boolean
  detailsSubmitted: boolean
  disabledReason: string
  status: TAccountStatus
}

export interface IAccountDoc extends Document, IAccount {}

// export interface IAccountModel extends Model<IAccountDoc> {
//   getById(id: string): Promise<IAccount | null>
// }
