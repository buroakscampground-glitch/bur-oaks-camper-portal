import { formatSmsPhone } from './twilio-sms'
import { filterOptedInPhones } from './sms-recipient-filter'

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

export async function consentedCamperSmsPhones(client: any, camper: any) {
  if (!camper?.sms_opt_in) return []

  const phones = camperSmsPhones(camper)
  if (!phones.length || !client?.from || !camper?.id) return []

  const { data, error } = await client
    .from('sms_phone_consents')
    .select('phone_number,opted_in')
    .eq('camper_id', camper.id)
    .in('phone_number', phones)

  // Keep sends working while migration 059 is being rolled out. Once the table
  // exists, a phone must have an affirmative row to receive messages.
  if (error?.code === '42P01' || error?.code === 'PGRST205') return phones
  if (error) throw error

  return filterOptedInPhones(phones, data || [])
}

export function phoneAutomationKey(baseKey: string, phone: string) {
  const digits = phone.replace(/\D/g, '')
  return `${baseKey}-phone-${digits}`
}
