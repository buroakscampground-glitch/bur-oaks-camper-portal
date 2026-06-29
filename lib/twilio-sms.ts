type SmsResult =
  | { sent: true; providerMessageId: string }
  | { sent: false; error: string }

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
}: {
  to: string
  body: string
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
    return {
      sent: false,
      error: result?.message || `Twilio rejected the text message (${response.status}).`,
    }
  }

  return {
    sent: true,
    providerMessageId: result?.sid || '',
  }
}
