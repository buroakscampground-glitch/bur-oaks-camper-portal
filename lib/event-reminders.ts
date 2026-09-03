import { escapeHtml } from './portal-invite-email'
import { isTwilioConfigured, sendTwilioSms } from './twilio-sms'
import { singleSegmentSms } from './sms-segments'
import { portalSmsUrl } from './portal-sms-links'
import { consentedCamperSmsPhones } from './camper-sms'

type CentralDate = {
  year: number
  month: number
  day: number
  iso: string
}

type DeliveryResult = {
  email: 'sent' | 'skipped' | 'failed'
  sms: 'sent' | 'skipped' | 'failed'
  errors: string[]
}

function cleanEmail(value: unknown) {
  return String(value || '').trim().toLowerCase()
}

function isRealEmail(email: string) {
  return /^\S+@\S+\.\S+$/.test(email) && !email.endsWith('@no-email.buroaks.local')
}

function uniqueEmails(values: unknown[]) {
  return Array.from(new Set(values.map(cleanEmail).filter(isRealEmail)))
}

function parseSender(value: string) {
  const trimmed = value.trim()
  const match = trimmed.match(/^(.*?)<([^>]+)>$/)
  if (!match) return { email: trimmed }
  return {
    name: match[1].trim().replace(/^"|"$/g, '') || undefined,
    email: match[2].trim(),
  }
}

function senderEmail(value: string) {
  return parseSender(value).email
}

function emailStatus() {
  const from = (
    process.env.EVENT_REMINDER_EMAIL_FROM ||
    process.env.SENDGRID_FROM ||
    process.env.CELEBRATION_EMAIL_FROM ||
    process.env.CAMPER_MESSAGE_FROM ||
    process.env.ADMIN_ALERT_FROM ||
    ''
  ).trim()
  const replyTo = (
    process.env.EVENT_REMINDER_EMAIL_REPLY_TO ||
    process.env.SENDGRID_REPLY_TO ||
    process.env.CELEBRATION_EMAIL_REPLY_TO ||
    process.env.CAMPER_MESSAGE_REPLY_TO ||
    process.env.ADMIN_ALERT_REPLY_TO ||
    'buroakscampground@gmail.com'
  ).trim()

  if (process.env.SENDGRID_API_KEY) {
    return { provider: 'sendgrid' as const, configured: Boolean(from), from, replyTo }
  }

  if (process.env.RESEND_API_KEY) {
    const testSender = /onboarding@resend\.dev/i.test(from)
    return { provider: 'resend' as const, configured: Boolean(from) && !testSender, from, replyTo }
  }

  return { provider: null, configured: false, from, replyTo }
}

function dateAtUtc(date: CentralDate) {
  return Date.UTC(date.year, date.month - 1, date.day)
}

export function addCentralDays(date: CentralDate, days: number) {
  const shifted = new Date(dateAtUtc(date) + days * 86_400_000)
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}`
}

export function daysUntilEvent(eventDate: string, today: CentralDate) {
  const match = String(eventDate || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  const eventUtc = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return Math.round((eventUtc - dateAtUtc(today)) / 86_400_000)
}

function eventDateLabel(eventDate: string) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date(`${eventDate}T12:00:00-05:00`))
}

function timingLabel(days: number) {
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  if (days === 7) return 'one week away'
  if (days === 14) return 'two weeks away'
  if (days < 7) return `coming up in ${days} days`
  return `coming up in ${days} days`
}

function reminderCopy(event: any, days: number) {
  const title = String(event.title || 'Bur Oaks event').trim()
  const date = eventDateLabel(event.event_date)
  const timing = timingLabel(days)
  const location = String(event.location || 'Bur Oaks Campground').trim()
  const description = String(event.description || '').trim()
  const calendarUrl = portalSmsUrl('/calendar')
  const subject = days === 0 ? `Today at Bur Oaks: ${title}` : `Coming up at Bur Oaks: ${title}`
  const text = `${title} is ${timing} on ${date} at ${location}.${description ? ` ${description}` : ''}`
  const sms = singleSegmentSms({
    message: `EVENT REMINDER - ${title} is ${timing}, ${date}.`,
    url: calendarUrl,
    action: 'RSVP',
    brand: 'Bur Oaks',
  })

  return { title, date, timing, location, description, calendarUrl, subject, text, sms }
}

function emailHtml(copy: ReturnType<typeof reminderCopy>, firstName: string) {
  return `
    <div style="font-family:Arial,sans-serif;background:#f5f1e8;padding:30px;color:#26382d">
      <div style="max-width:640px;margin:0 auto;background:#fff;border-radius:22px;overflow:hidden;border:1px solid #e2dccf;box-shadow:0 16px 45px rgba(38,56,45,.10)">
        <div style="background:linear-gradient(135deg,#20492f,#315f3d);color:#fff;padding:30px;text-align:center">
          <div style="font-size:34px">🌳</div>
          <div style="margin-top:10px;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#ead7a6;font-weight:800">Bur Oaks Campground</div>
          <h1 style="margin:9px 0 0;font-family:Georgia,serif;font-size:32px;font-weight:500">Something good is coming up.</h1>
        </div>
        <div style="padding:32px">
          <p style="margin:0 0 10px;color:#738077;font-size:13px">Hi ${escapeHtml(firstName || 'there')},</p>
          <p style="margin:0 0 8px;color:#9b752e;font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase">${escapeHtml(copy.timing)}</p>
          <h2 style="margin:0;font-family:Georgia,serif;font-size:28px;color:#294434">${escapeHtml(copy.title)}</h2>
          <p style="margin:14px 0 0;font-size:16px;line-height:1.6"><strong>${escapeHtml(copy.date)}</strong><br>${escapeHtml(copy.location)}</p>
          ${copy.description ? `<p style="margin:18px 0 0;color:#536159;font-size:15px;line-height:1.65">${escapeHtml(copy.description)}</p>` : ''}
          <div style="margin-top:26px;text-align:center">
            <a href="${escapeHtml(copy.calendarUrl)}" style="display:inline-block;padding:13px 21px;border-radius:999px;background:#315f3d;color:#fff;text-decoration:none;font-weight:800">View details and RSVP</a>
          </div>
          <p style="margin:26px 0 0;text-align:center;color:#7b857e;font-size:12px;line-height:1.5">We hope to see you there! — Anthony, Dawn, and the Bur Oaks team</p>
        </div>
      </div>
    </div>
  `
}

async function sendEmail({ to, subject, text, html }: { to: string[]; subject: string; text: string; html: string }) {
  const status = emailStatus()
  if (!status.configured || !status.provider) {
    return { sent: false, provider: status.provider, error: 'Email is not configured.' }
  }

  if (status.provider === 'sendgrid') {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: to.map((email) => ({ email })), subject }],
        from: parseSender(status.from),
        reply_to: { email: senderEmail(status.replyTo) },
        content: [{ type: 'text/plain', value: text }, { type: 'text/html', value: html }],
      }),
    })
    if (!response.ok) {
      return { sent: false, provider: status.provider, error: await response.text().catch(() => `SendGrid error ${response.status}`) }
    }
    return { sent: true, provider: status.provider, providerMessageId: response.headers.get('x-message-id') || null }
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: status.from, to, reply_to: status.replyTo, subject, html, text }),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) return { sent: false, provider: status.provider, error: result?.message || 'Resend rejected the email.' }
  return { sent: true, provider: status.provider, providerMessageId: result?.id || null }
}

async function reserveDelivery(client: any, eventId: string, camperId: string, reminderDate: string, channel: 'email' | 'sms', recipient: string, subject: string | null, message: string) {
  const key = { event_id: eventId, camper_id: camperId, reminder_date: reminderDate, channel, recipient_key: recipient }
  const { data: existing, error: lookupError } = await client
    .from('event_reminder_deliveries')
    .select('id,status,updated_at')
    .match(key)
    .maybeSingle()

  if (lookupError) return { reserved: false, error: lookupError.message }
  if (existing?.status === 'sent') return { reserved: false, skipped: 'already sent' }
  if (existing?.status === 'sending' && new Date(existing.updated_at || 0).getTime() > Date.now() - 30 * 60_000) {
    return { reserved: false, skipped: 'already sending' }
  }

  const values = {
    ...key,
    status: 'sending',
    recipient,
    subject,
    message,
    provider: null,
    provider_message_id: null,
    error_message: null,
    sent_at: null,
    updated_at: new Date().toISOString(),
  }

  if (existing) {
    const { error } = await client.from('event_reminder_deliveries').update(values).eq('id', existing.id)
    return error ? { reserved: false, error: error.message } : { reserved: true, id: existing.id }
  }

  const { data, error } = await client.from('event_reminder_deliveries').insert(values).select('id').single()
  if (error?.code === '23505') return { reserved: false, skipped: 'already reserved' }
  return error ? { reserved: false, error: error.message } : { reserved: true, id: data.id }
}

async function finalizeDelivery(client: any, id: string, result: { sent: boolean; provider?: string | null; providerMessageId?: string | null; error?: string }) {
  await client.from('event_reminder_deliveries').update({
    status: result.sent ? 'sent' : 'failed',
    provider: result.provider || null,
    provider_message_id: result.sent ? result.providerMessageId || null : null,
    error_message: result.sent ? null : result.error || 'Delivery failed.',
    sent_at: result.sent ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }).eq('id', id)
}

export async function sendEventReminder({ client, camper, event, today, days }: { client: any; camper: any; event: any; today: CentralDate; days: number }): Promise<DeliveryResult> {
  const copy = reminderCopy(event, days)
  const summary: DeliveryResult = { email: 'skipped', sms: 'skipped', errors: [] }
  const recipients = uniqueEmails([camper.email, camper.secondary_email])
  const email = emailStatus()

  if (email.configured && recipients.length) {
    const reservation = await reserveDelivery(client, String(event.id), camper.id, today.iso, 'email', recipients.join(', '), copy.subject, copy.text)
    if (reservation.reserved && reservation.id) {
      const result = await sendEmail({
        to: recipients,
        subject: copy.subject,
        text: `${copy.text}\n\nView details and RSVP: ${copy.calendarUrl}\n\nWe hope to see you there! — Anthony, Dawn, and the Bur Oaks team`,
        html: emailHtml(copy, String(camper.first_name || '').trim()),
      })
      await finalizeDelivery(client, reservation.id, result)
      summary.email = result.sent ? 'sent' : 'failed'
      if (!result.sent) summary.errors.push(result.error || 'Email failed.')
    }
  }

  const phones = camper.sms_opt_in && isTwilioConfigured()
    ? await consentedCamperSmsPhones(client, camper)
    : []
  if (phones.length) {
    let sent = 0
    let failed = 0
    for (const phone of phones) {
      const reservation = await reserveDelivery(client, String(event.id), camper.id, today.iso, 'sms', phone, null, copy.sms)
      if (!reservation.reserved || !reservation.id) continue
      const result = await sendTwilioSms({ to: phone, body: copy.sms })
      await finalizeDelivery(client, reservation.id, {
        sent: result.sent,
        provider: 'twilio',
        providerMessageId: result.sent ? result.providerMessageId : null,
        error: result.sent ? undefined : result.error,
      })
      if (result.sent) sent += 1
      else {
        failed += 1
        summary.errors.push(result.error || `Text reminder to ${phone} failed.`)
      }
    }
    summary.sms = failed ? 'failed' : sent ? 'sent' : 'skipped'
  }

  return summary
}
