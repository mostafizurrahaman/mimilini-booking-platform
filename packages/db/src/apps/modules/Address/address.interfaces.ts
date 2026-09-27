import { Document, Types } from 'mongoose'
import type { TAddressType } from './address.constants'
import type { ILocation } from '../ArtistProfile'

export interface IAddress {
  customer: Types.ObjectId
  address: string
  location: ILocation
  apartmentOrUnit?: string | null
  city: string
  state: string
  postalCode: string
  country: string
  isDefault: boolean
  type: TAddressType
}

export interface IAddressDoc extends Document, IAddress {}

// export interface IAddressModel extends Model<IAddressDoc> {
//   getById(id: string): Promise<IAddress | null>
// }
