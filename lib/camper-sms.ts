import { formatSmsPhone } from './twilio-sms'

export function camperSmsPhones(camper: any) {
  const phones = [
    camper?.phone,
    camper?.alternate_phone,
    camper?.second_profile_phone,
  ]
    .map((phone) => formatSmsPhone(phone))
    .filter((phone): phone is string => Boolean(phone))

  return Array.from(new Set(phones))
}

export function phoneAutomationKey(baseKey: string, phone: string) {
  const digits = phone.replace(/\D/g, '')
  return `${baseKey}-phone-${digits}`
}
