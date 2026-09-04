type SmsResult =
  | { sent: true; providerMessageId: string }
  | { sent: false; error: string; errorCode?: number; consentUpdated?: boolean }

type SmsDatabaseClient = {
  from: (table: string) => any
}

function camperPhones(camper: any) {
  return Array.from(new Set([
    camper?.phone,
    camper?.alternate_phone,
    camper?.second_profile_phone,
  ].map(formatSmsPhone).filter(Boolean)))
}

export function isTwilioUnsubscribeError(errorCode: unknown, message: unknown) {
  return Number(errorCode) === 21610 || /(?:has\s+)?unsubscribed|opted\s+out/i.test(String(message || ''))
}

async function syncProviderUnsubscribe(client: SmsDatabaseClient, camperId: string, phone: string) {
  const cleanPhone = formatSmsPhone(phone)
  if (!cleanPhone || !camperId) return false

  // A Twilio STOP is tied to the telephone number, not to one camper row. The
  // same household number can legitimately appear on more than one linked
  // profile, so suppress it everywhere after the first provider rejection.
  const { data: campers, error: camperError } = await client
    .from('campers')
    .select('id,phone,alternate_phone,second_profile_phone,sms_opt_in_at,event_reminders_opt_in_at')
  if (camperError) return false
  const matchingCampers = (campers || []).filter((camper: any) => camperPhones(camper).includes(cleanPhone))
  if (!matchingCampers.some((camper: any) => String(camper.id) === String(camperId))) return false

  const now = new Date().toISOString()
  const { error: consentError } = await client.from('sms_phone_consents').upsert(matchingCampers.map((camper: any) => ({
    camper_id: camper.id,
    phone_number: cleanPhone,
    opted_in: false,
    opted_in_at: null,
    opted_out_at: now,
    source: 'twilio-provider-rejection',
    updated_at: now,
  })), { onConflict: 'camper_id,phone_number' })
  if (consentError) return false

  for (const camper of matchingCampers) {
    const savedPhones = camperPhones(camper)
    const { data: consentRows, error: remainingError } = await client
      .from('sms_phone_consents')
      .select('phone_number,opted_in')
      .eq('camper_id', camper.id)
      .in('phone_number', savedPhones)
    if (remainingError) return false

    const householdEnabled = (consentRows || []).some((row: any) => row.opted_in === true)
    const { error: camperUpdateError } = await client.from('campers').update({
      sms_opt_in: householdEnabled,
      event_reminders_opt_in: householdEnabled,
      sms_opt_out_at: householdEnabled ? null : now,
      sms_last_keyword: 'PROVIDER_UNSUBSCRIBED',
    }).eq('id', camper.id)
    if (camperUpdateError) return false

    const { error: eventError } = await client.from('sms_consent_events').insert({
      camper_id: camper.id,
      phone_number: cleanPhone,
      keyword: 'PROVIDER_UNSUBSCRIBED',
      consent_action: 'opt_out',
      provider_message_id: null,
    })
    if (eventError && !['42P01', 'PGRST205'].includes(eventError.code || '')) {
      console.error('Unable to log provider unsubscribe event:', eventError.code)
    }
  }

  return true
}

export function isTwilioConfigured() {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_PHONE_NUMBER
  )
}

export function formatSmsPhone(value: unknown) {
  const digits = String(value || '').replace(/\D/g, '')

  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  if (String(value || '').trim().startsWith('+')) return String(value).trim()

  return ''
}

export async function sendTwilioSms({
  to,
  body,
  client,
  camperId,
}: {
  to: string
  body: string
  client?: SmsDatabaseClient
  camperId?: string
}): Promise<SmsResult> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const from = process.env.TWILIO_PHONE_NUMBER

  if (!accountSid || !authToken || !from) {
    return { sent: false, error: 'Twilio is not connected yet. Add the Twilio keys in Vercel.' }
  }

  const cleanTo = formatSmsPhone(to)
  if (!cleanTo) {
    return { sent: false, error: 'No valid mobile number is saved for this camper.' }
  }

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        From: from,
        To: cleanTo,
        Body: body,
      }),
    }
  )

  const result = await response.json().catch(() => null)

  if (!response.ok) {
    const error = result?.message || `Twilio rejected the text message (${response.status}).`
    const errorCode = Number(result?.code || 0) || undefined
    let consentUpdated = false
    if (client && camperId && isTwilioUnsubscribeError(errorCode, error)) {
      consentUpdated = await syncProviderUnsubscribe(client, camperId, cleanTo)
    }
    return {
      sent: false,
      error,
      errorCode,
      consentUpdated,
    }
  }

  return {
    sent: true,
    providerMessageId: result?.sid || '',
  }
}
