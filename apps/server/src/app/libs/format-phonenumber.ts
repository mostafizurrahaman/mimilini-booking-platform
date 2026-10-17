export const formatPhoneNumber = (phone: string) => {
  let formattedPhone = phone?.trim()

  if (formattedPhone && !formattedPhone.startsWith('+')) {
    if (formattedPhone.startsWith('61')) {
      formattedPhone = `+${formattedPhone}`
    } else {
      const cleanPhone = formattedPhone.startsWith('0')
        ? formattedPhone.substring(1)
        : formattedPhone
      formattedPhone = `+61${cleanPhone}`
    }
  }

  return formattedPhone
}
