import { formatSmsPhone, isTwilioConfigured, sendTwilioSms } from './twilio-sms'

type OwnerTextAlertInput = {
  type: string
  title: string
  message: string
  lotNumber?: string | null
}

function ownerTextEnabled() {
  return process.env.OWNER_TEXT_ALERTS_ENABLED !== 'false'
}

function ownerTextTypes() {
  const raw = process.env.OWNER_TEXT_ALERT_TYPES || 'maintenance_request,payment_received,direct_message,sewer_pump_out,saturday_dinner'

  return new Set(
    raw
      .split(',')
      .map((type) => type.trim())
      .filter(Boolean)
  )
}

function ownerTextRecipients() {
  const raw =
    process.env.OWNER_ALERT_PHONES ||
    process.env.ADMIN_ALERT_PHONES ||
    process.env.OWNER_ALERT_PHONE ||
    process.env.ADMIN_ALERT_PHONE ||
    ''

  return Array.from(
    new Set(
      raw
        .split(',')
        .map((phone) => formatSmsPhone(phone))
        .filter(Boolean)
    )
  )
}

function cleanSmsText(value: unknown, maxLength: number) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
}

export function ownerTextAlertConfigured() {
  return ownerTextEnabled() && isTwilioConfigured() && ownerTextRecipients().length > 0
}

export async function sendOwnerTextAlert({
  type,
  title,
  message,
  lotNumber,
}: OwnerTextAlertInput) {
  if (!ownerTextEnabled()) {
    return { skipped: true, reason: 'Owner text alerts are turned off.' }
  }

  if (!ownerTextTypes().has(type)) {
    return { skipped: true, reason: `Owner text alerts are not enabled for ${type}.` }
  }

  if (!isTwilioConfigured()) {
    return { skipped: true, reason: 'Twilio is not configured.' }
  }

  const recipients = ownerTextRecipients()

  if (!recipients.length) {
    return { skipped: true, reason: 'No owner alert phone number is configured.' }
  }

  const siteLine = lotNumber ? `Site ${lotNumber}: ` : ''
  const body = cleanSmsText(
    `Bur Oaks Alert: ${siteLine}${title}. ${message}. Open the admin portal to review.`,
    1200
  )

  const results = await Promise.all(
    recipients.map(async (phone) => {
      const result = await sendTwilioSms({ to: phone, body })
      return { phone, ...result }
    })
  )

  return {
    sent: results.filter((result) => result.sent).length,
    failed: results.filter((result) => !result.sent).length,
    results,
  }
}
