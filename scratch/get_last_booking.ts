import mongoose from 'mongoose'
import jwt from 'jsonwebtoken'
import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'

dotenv.config({ path: path.resolve(__dirname, '../apps/server/.env.development') })

const DB_URL = process.env.DATABASE_URL || 'mongodb+srv://devmostafiz04_db_user:qq7b36kKKfj3E7KG@cluster0.qii6fpb.mongodb.net/mimilini_booking_platform'
const JWT_SECRET = process.env.ACCESS_TOKEN_SECRET || 'secretsecretsecretsecretsecretsecretsecretsecret'

async function run() {
  await mongoose.connect(DB_URL)
  console.log('Connected to DB')

  const db = mongoose.connection.db
  if (!db) {
    console.error('No DB connection')
    process.exit(1)
  }

  // Find last booking
  const lastBooking = await db.collection('bookings').findOne({}, { sort: { _id: -1 } })
  console.log('Last Booking Found:', lastBooking ? lastBooking._id : 'None')

  if (!lastBooking) {
    console.log('No bookings found in DB!')
    // Let's check users
    const users = await db.collection('users').find({}).limit(5).toArray()
    console.log('Available users:', users.map(u => ({ id: u._id, role: u.role, email: u.email })))
    await mongoose.disconnect()
    return
  }

  const customerUser = await db.collection('users').findOne({ _id: lastBooking.customer })
  const artistProfile = await db.collection('artistprofiles').findOne({ _id: lastBooking.artist })
  const artistUser = artistProfile ? await db.collection('users').findOne({ _id: artistProfile.user }) : null
  const adminUser = await db.collection('users').findOne({ role: { $in: ['admin', 'super_admin'] } })

  function generateToken(user: any) {
    if (!user) return ''
    const payload = {
      _id: user._id.toString(),
      email: user.email,
      name: user.name,
      profileImage: user.profileImage || '',
      status: user.status,
      role: user.role,
    }
    return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' })
  }

  const customerToken = generateToken(customerUser)
  const artistToken = generateToken(artistUser)
  const adminToken = generateToken(adminUser)

  const output = {
    bookingId: lastBooking._id.toString(),
    bookingNumber: lastBooking.bookingNumber,
    status: lastBooking.status,
    bookingDate: lastBooking.bookingDate,
    startTime: lastBooking.startTime,
    totalPrice: lastBooking.totalPrice,
    initialPaymentStatus: lastBooking.initialPayment?.status,
    balancePaymentStatus: lastBooking.balancePayment?.status,
    customerId: lastBooking.customer?.toString(),
    customerEmail: customerUser?.email,
    artistProfileId: lastBooking.artist?.toString(),
    artistUserId: artistUser?._id?.toString(),
    artistEmail: artistUser?.email,
    serviceId: lastBooking.service?.toString(),
    adminEmail: adminUser?.email,
    customerToken,
    artistToken,
    adminToken,
  }

  console.log('\n================ BOOKING DETAILS ================')
  console.log(JSON.stringify(output, null, 2))

  // Update Postman environment file
  const envFilePath = path.resolve(__dirname, '../docs/Mimilini_Booking.postman_environment.json')
  if (fs.existsSync(envFilePath)) {
    const envJson = JSON.parse(fs.readFileSync(envFilePath, 'utf8'))
    const updates: Record<string, string> = {
      baseUrl: 'http://localhost:8080/api/v1',
      customerToken: customerToken || '',
      artistToken: artistToken || '',
      adminToken: adminToken || '',
      bookingId: lastBooking._id.toString(),
      artistId: lastBooking.artist?.toString() || '',
      serviceId: lastBooking.service?.toString() || '',
      paymentMethodId: lastBooking.initialPayment?.paymentMethodId || 'pm_card_visa',
    }

    envJson.values = envJson.values.map((v: any) => {
      if (updates[v.key] !== undefined) {
        return { ...v, value: updates[v.key] }
      }
      return v
    })

    fs.writeFileSync(envFilePath, JSON.stringify(envJson, null, 2))
    console.log('\nSuccessfully updated docs/Mimilini_Booking.postman_environment.json with real tokens & booking IDs!')
  }

  await mongoose.disconnect()
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
