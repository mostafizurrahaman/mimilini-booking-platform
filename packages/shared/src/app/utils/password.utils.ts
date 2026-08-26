import bcrypt from 'bcrypt'

// 1. Hash Password
export const hashPassword = async (password: string, soltRounds: number) => {
  const hashedPassword = bcrypt.hash(password, soltRounds)
  return hashedPassword
}

// 2. Compare Password
export const comparePassword = async (newPassword: string, hashedPassword: string) => {
  console.log({newPassword, hashedPassword})
  const isPasswordMatched = await bcrypt.compare(newPassword, hashedPassword)
  return isPasswordMatched
}
