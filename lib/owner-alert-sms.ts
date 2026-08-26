import { formatSmsPhone, isTwilioConfigured, sendTwilioSms } from './twilio-sms'
import { portalSmsUrl } from './portal-sms-links'

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
  const raw = process.env.OWNER_TEXT_ALERT_TYPES || 'maintenance_request,payment_received,direct_message,sewer_pump_out,saturday_dinner,site_care'

  const types = new Set(
    raw
      .split(',')
      .map((type) => type.trim())
      .filter(Boolean)
  )

  // Site-care review texts are an office workflow requirement, even when an
  // older environment list predates this alert type.
  types.add('site_care')
  return types
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

function adminPathForAlertType(type: string) {
  if (type === 'maintenance_request') return '/admin/maintenance'
  if (type === 'payment_received') return '/admin/invoices'
  if (type === 'direct_message') return '/admin/messages'
  if (type === 'sewer_pump_out') return '/admin/pump-outs'
  if (type === 'saturday_dinner') return '/admin/dinners'
  if (type === 'site_care') return '/admin/site-care'
  if (type === 'website_waitlist') return '/admin/waitlist'
  return '/admin/notifications'
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
    `Bur Oaks Alert: ${siteLine}${title}. ${message}. Click here to review: ${portalSmsUrl(adminPathForAlertType(type))}`,
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
