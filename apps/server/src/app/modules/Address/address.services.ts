import { Address, addressSearchableFields, addressSortableFields, type IUser } from '@repo/db'
import httpStatus from 'http-status'
import { AppError } from '@repo/shared'
import mongoose, { type PipelineStage, Types } from 'mongoose'
import { formatQuery } from '@app/libs'
import type {
  TCreateAddressPayloadType,
  TUpdateAddressPayloadType,
  TGetAllAddressQueryParamsType,
} from './address.validations'

// 1. Create Address
const createAddress = async (user: IUser, payload: TCreateAddressPayloadType) => {
  const {
    type,
    address,
    city,
    country,
    latitude,
    longitude,
    postalCode,
    state,
    apartmentOrUnit,
    isDefault,
  } = payload

  const existingDefaultAddress = await Address.findOne({
    customer: user._id,
    isDefault: true,
  })

  const isFirstAddress = !existingDefaultAddress
  const shouldBeDefault = isFirstAddress || Boolean(isDefault)

  const mongoSession = await mongoose.startSession()

  try {
    mongoSession.startTransaction()

    if (shouldBeDefault && existingDefaultAddress) {
      await Address.updateMany(
        { customer: user._id, isDefault: true },
        { $set: { isDefault: false } },
        { session: mongoSession }
      )
    }

    const [newAddress] = await Address.create(
      [
        {
          customer: user._id, // LINKED WITH AUTH USER
          type,
          address,
          location: {
            type: 'Point',
            coordinates: [longitude, latitude],
          },
          apartmentOrUnit: apartmentOrUnit || null,
          city,
          state,
          postalCode,
          country,
          isDefault: shouldBeDefault,
        },
      ],
      { session: mongoSession }
    )

    if (!newAddress) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Failed to create address.')
    }

    await mongoSession.commitTransaction()
    return newAddress
  } catch (error) {
    await mongoSession.abortTransaction()
    throw error
  } finally {
    await mongoSession.endSession()
  }
}

// 2. Update Address
const updateAddress = async (user: IUser, id: string, payload: TUpdateAddressPayloadType) => {
  const existingAddress = await Address.findOne({
    _id: id,
    customer: user._id,
  })

  if (!existingAddress) {
    throw new AppError(httpStatus.NOT_FOUND, 'Address not found or unauthorized')
  }

  const { latitude, longitude, isDefault, ...rest } = payload
  const mongoSession = await mongoose.startSession()

  try {
    mongoSession.startTransaction()

    if (isDefault === true && !existingAddress.isDefault) {
      await Address.updateMany(
        { customer: user._id, _id: { $ne: existingAddress._id } },
        { $set: { isDefault: false } },
        { session: mongoSession }
      )
    }

    const updateDoc: Record<string, unknown> = { ...rest }

    if (isDefault !== undefined) {
      updateDoc.isDefault = isDefault
    }

    if (latitude !== undefined && longitude !== undefined) {
      updateDoc.location = {
        type: 'Point',
        coordinates: [longitude, latitude],
      }
    }

    const updatedAddress = await Address.findByIdAndUpdate(
      id,
      { $set: updateDoc },
      { new: true, runValidators: true, session: mongoSession }
    )

    await mongoSession.commitTransaction()
    return updatedAddress
  } catch (error) {
    await mongoSession.abortTransaction()
    throw error
  } finally {
    await mongoSession.endSession()
  }
}

// 3. Set Address as Default
const setDefaultAddress = async (user: IUser, id: string) => {
  const targetAddress = await Address.findOne({
    _id: id,
    customer: user._id,
  })

  if (!targetAddress) {
    throw new AppError(httpStatus.NOT_FOUND, 'Address not found')
  }

  if (targetAddress.isDefault) {
    return targetAddress
  }

  const mongoSession = await mongoose.startSession()

  try {
    mongoSession.startTransaction()

    await Address.updateMany(
      { customer: user._id },
      { $set: { isDefault: false } },
      { session: mongoSession }
    )

    targetAddress.isDefault = true
    await targetAddress.save({ session: mongoSession })

    await mongoSession.commitTransaction()
    return targetAddress
  } catch (error) {
    await mongoSession.abortTransaction()
    throw error
  } finally {
    await mongoSession.endSession()
  }
}

// 4. Get My Addresses (Customer)
const getMyAddresses = async (user: IUser, query: TGetAllAddressQueryParamsType) => {
  const { skipPagination, type } = query
  const { page, limit, skip, sortBy, sortOrder, searchTerm, fromDate, toDate } = formatQuery(
    query,
    addressSortableFields
  )

  const isPaginationSkipped =
    typeof skipPagination === 'string'
      ? skipPagination === 'true'
      : typeof skipPagination === 'boolean'
        ? skipPagination
        : false

  const pipeline: PipelineStage[] = [
    {
      $match: {
        customer: new Types.ObjectId(user._id),
      },
    },
  ]

  if (type) {
    pipeline.push({
      $match: {
        type,
      },
    })
  }

  if (fromDate || toDate) {
    const dateFilter: Record<string, unknown> = {}
    if (fromDate) dateFilter.$gte = new Date(fromDate)
    if (toDate) dateFilter.$lte = new Date(toDate)

    pipeline.push({ $match: { createdAt: dateFilter } })
  }

  if (searchTerm) {
    pipeline.push({
      $match: {
        $or: addressSearchableFields.map((field) => ({
          [field]: { $regex: searchTerm, $options: 'i' },
        })),
      },
    })
  }

  // Priority sorting: Default address always on top
  pipeline.push({
    $sort: {
      isDefault: -1,
      [sortBy]: sortOrder,
    },
  })

  const paginationStage: PipelineStage.FacetPipelineStage[] = isPaginationSkipped
    ? [{ $match: {} }]
    : [{ $skip: skip }, { $limit: limit }]

  pipeline.push({
    $facet: {
      data: paginationStage,
      meta: [{ $count: 'total' }],
    },
  })

  const aggregated = await Address.aggregate(pipeline)

  const data = aggregated?.[0]?.data || []
  const total = aggregated?.[0]?.meta?.[0]?.total || 0

  return {
    data,
    meta: {
      page: isPaginationSkipped ? 1 : page,
      limit: isPaginationSkipped ? total : limit,
      total,
      totalPages: isPaginationSkipped ? 1 : Math.ceil(total / limit) || 1,
    },
  }
}

// 5. Get Address By ID
const getAddressById = async (user: IUser, id: string) => {
  const result = await Address.findOne({
    _id: id,
    customer: user._id,
  })

  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, 'Address not found')
  }

  return result
}

// 6. Delete Address
const deleteAddressById = async (user: IUser, id: string) => {
  const addressToDelete = await Address.findOne({
    _id: id,
    customer: user._id,
  })

  if (!addressToDelete) {
    throw new AppError(httpStatus.NOT_FOUND, 'Address not found')
  }

  const mongoSession = await mongoose.startSession()

  try {
    mongoSession.startTransaction()

    const wasDefault = addressToDelete.isDefault
    await addressToDelete.deleteOne({ session: mongoSession })

    // If deleted address was default, make the most recently created one default
    if (wasDefault) {
      const remainingAddress = await Address.findOne({ customer: user._id })
        .sort({ createdAt: -1 })
        .session(mongoSession)

      if (remainingAddress) {
        remainingAddress.isDefault = true
        await remainingAddress.save({ session: mongoSession })
      }
    }

    await mongoSession.commitTransaction()
    return addressToDelete
  } catch (error) {
    await mongoSession.abortTransaction()
    throw error
  } finally {
    await mongoSession.endSession()
  }
}

export const addressServices = {
  createAddress,
  updateAddress,
  setDefaultAddress,
  getMyAddresses,
  getAddressById,
  deleteAddressById,
}
