import { escapeHtml } from './portal-invite-email'
import { formatSmsPhone, isTwilioConfigured, sendTwilioSms } from './twilio-sms'

export type CelebrationProfile = 'primary' | 'secondary' | 'household'
export type CelebrationType = 'birthday' | 'anniversary'

type CentralDate = {
  year: number
  month: number
  day: number
  iso: string
}

type CelebrationEvent = {
  type: CelebrationType
  profile: CelebrationProfile
  name: string
  years?: number
}

type SendCelebrationOptions = {
  client: any
  camper: any
  event: CelebrationEvent
  today: CentralDate
}

type EmailPayload = {
  to: string[]
  from: string
  replyTo: string
  subject: string
  html: string
  text: string
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

function isResendTestSender(from: string) {
  return /<\s*onboarding@resend\.dev\s*>/i.test(from) || /(^|\s)onboarding@resend\.dev(\s|$)/i.test(from)
}

function celebrationEmailStatus() {
  const from = (
    process.env.SENDGRID_FROM ||
    process.env.CELEBRATION_EMAIL_FROM ||
    process.env.INVOICE_EMAIL_FROM ||
    process.env.CAMPER_MESSAGE_FROM ||
    process.env.PORTAL_INVITE_FROM ||
    process.env.ADMIN_ALERT_FROM ||
    ''
  ).trim()
  const replyTo = (
    process.env.SENDGRID_REPLY_TO ||
    process.env.CELEBRATION_EMAIL_REPLY_TO ||
    process.env.CAMPER_MESSAGE_REPLY_TO ||
    process.env.INVOICE_EMAIL_REPLY_TO ||
    process.env.ADMIN_ALERT_REPLY_TO ||
    'buroakscampground@gmail.com'
  ).trim()

  if (process.env.SENDGRID_API_KEY) {
    return { provider: 'sendgrid' as const, configured: Boolean(from), from, replyTo }
  }

  if (process.env.RESEND_API_KEY) {
    return {
      provider: 'resend' as const,
      configured: Boolean(from) && !isResendTestSender(from),
      from,
      replyTo,
    }
  }

  return { provider: null, configured: false, from, replyTo }
}

export function centralDate(now = new Date()): CentralDate {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value || 0)
  const year = value('year')
  const month = value('month')
  const day = value('day')
  return { year, month, day, iso: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` }
}

function parseDate(value: unknown) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) }
}

export function birthdayIsToday(value: unknown, today: CentralDate) {
  const date = parseDate(value)
  return Boolean(date && date.month === today.month && date.day === today.day)
}

export function anniversaryYears(value: unknown, today: CentralDate) {
  const date = parseDate(value)
  if (!date || date.month !== today.month || date.day !== today.day) return 0
  return Math.max(0, today.year - date.year)
}

function firstName(value: unknown, fallback = 'there') {
  return String(value || '').trim().split(/\s+/)[0] || fallback
}

function messageCopy(event: CelebrationEvent) {
  const name = firstName(event.name)
  if (event.type === 'birthday') {
    return {
      subject: `Happy Birthday from your Bur Oaks camping family!`,
      heading: `Happy Birthday, ${name}!`,
      text: `Happy Birthday, ${name}! We hope your day is filled with sunshine, laughter, and a little extra time doing what you love. We’re so glad you’re part of the Bur Oaks camping family!`,
      sms: `Bur Oaks Campground: Happy Birthday, ${name}! We hope your day is filled with sunshine, laughter, and a little extra time doing what you love. We’re so glad you’re part of the Bur Oaks camping family! Reply STOP to opt out.`,
    }
  }

  const years = Math.max(1, Number(event.years || 1))
  return {
    subject: `Happy ${years}-year Bur Oaks anniversary!`,
    heading: `${years} wonderful year${years === 1 ? '' : 's'} at Bur Oaks.`,
    text: `Happy ${years}-year campground anniversary, ${name}! Thank you for being part of our Bur Oaks camping family. The memories, friendships, and time around the oaks are what make this place special, and we’re truly grateful you’re here.`,
    sms: `Bur Oaks Campground: Happy ${years}-year campground anniversary, ${name}! Thank you for being part of our camping family. The memories and friendships around the oaks make this place special, and we’re grateful you’re here. Reply STOP to opt out.`,
  }
}

function emailRecipients(camper: any, profile: CelebrationProfile) {
  if (profile === 'primary') return uniqueEmails([camper.email])
  if (profile === 'secondary') return uniqueEmails([camper.secondary_email || camper.email])
  return uniqueEmails([camper.email, camper.secondary_email])
}

function smsRecipient(camper: any, profile: CelebrationProfile) {
  if (profile === 'secondary') {
    return formatSmsPhone(camper.second_profile_phone || camper.alternate_phone || camper.phone)
  }
  return formatSmsPhone(camper.phone)
}

function emailHtml(event: CelebrationEvent, heading: string, text: string) {
  const accent = event.type === 'birthday' ? '#d49a36' : '#89a96b'
  const icon = event.type === 'birthday' ? '🎂' : '🌳'
  return `
    <div style="font-family:Arial,sans-serif;background:#f5f1e8;padding:30px;color:#26382d">
      <div style="max-width:640px;margin:0 auto;background:#fff;border-radius:22px;overflow:hidden;border:1px solid #e2dccf;box-shadow:0 16px 45px rgba(38,56,45,.10)">
        <div style="background:linear-gradient(135deg,#20492f,#315f3d);color:#fff;padding:30px;text-align:center">
          <div style="font-size:34px">${icon}</div>
          <div style="margin-top:10px;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#ead7a6;font-weight:800">Bur Oaks Campground</div>
          <h1 style="margin:9px 0 0;font-family:Georgia,serif;font-size:32px;font-weight:500">${escapeHtml(heading)}</h1>
        </div>
        <div style="padding:32px;text-align:center">
          <div style="width:54px;height:3px;margin:0 auto 22px;border-radius:4px;background:${accent}"></div>
          <p style="margin:0;font-family:Georgia,serif;font-size:20px;line-height:1.65;color:#31463a">${escapeHtml(text)}</p>
          <p style="margin:26px 0 0;color:#6e796f;font-size:13px;line-height:1.6">With warm wishes from Anthony, Dawn, and the Bur Oaks team.</p>
        </div>
      </div>
    </div>
  `
}

async function sendEmail(payload: EmailPayload) {
  const status = celebrationEmailStatus()
  if (!status.configured || !status.provider) return { sent: false, provider: status.provider, error: 'Email is not configured.' }

  if (status.provider === 'sendgrid') {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: payload.to.map((email) => ({ email })), subject: payload.subject }],
        from: parseSender(payload.from),
        reply_to: { email: senderEmail(payload.replyTo) },
        content: [{ type: 'text/plain', value: payload.text }, { type: 'text/html', value: payload.html }],
      }),
    })
    if (!response.ok) return { sent: false, provider: status.provider, error: await response.text().catch(() => `SendGrid error ${response.status}`) }
    return { sent: true, provider: status.provider, providerMessageId: response.headers.get('x-message-id') || null }
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: payload.from, to: payload.to, reply_to: payload.replyTo, subject: payload.subject, html: payload.html, text: payload.text }),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) return { sent: false, provider: status.provider, error: result?.message || 'Resend rejected the email.' }
  return { sent: true, provider: status.provider, providerMessageId: result?.id || null }
}

async function reserveDelivery(client: any, camperId: string, event: CelebrationEvent, year: number, channel: 'email' | 'sms', recipient: string, subject: string | null, message: string) {
  const key = {
    camper_id: camperId,
    celebration_type: event.type,
    recipient_profile: event.profile,
    celebration_year: year,
    channel,
  }
  const { data: existing, error: lookupError } = await client
    .from('camper_celebration_deliveries')
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
    const { error } = await client.from('camper_celebration_deliveries').update(values).eq('id', existing.id)
    return error ? { reserved: false, error: error.message } : { reserved: true, id: existing.id }
  }

  const { data, error } = await client.from('camper_celebration_deliveries').insert(values).select('id').single()
  if (error?.code === '23505') return { reserved: false, skipped: 'already reserved' }
  return error ? { reserved: false, error: error.message } : { reserved: true, id: data.id }
}

async function finalizeDelivery(client: any, id: string, result: { sent: boolean; provider?: string | null; providerMessageId?: string | null; error?: string }) {
  await client.from('camper_celebration_deliveries').update({
    status: result.sent ? 'sent' : 'failed',
    provider: result.provider || null,
    provider_message_id: result.sent ? result.providerMessageId || null : null,
    error_message: result.sent ? null : result.error || 'Delivery failed.',
    sent_at: result.sent ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }).eq('id', id)
}

export async function sendCamperCelebration({ client, camper, event, today }: SendCelebrationOptions) {
  const copy = messageCopy(event)
  const summary = { email: 'skipped', sms: 'skipped', errors: [] as string[] }
  const emailStatus = celebrationEmailStatus()
  const recipients = emailRecipients(camper, event.profile)

  if (emailStatus.configured && recipients.length) {
    const reservation = await reserveDelivery(client, camper.id, event, today.year, 'email', recipients.join(', '), copy.subject, copy.text)
    if (reservation.reserved && reservation.id) {
      const result = await sendEmail({
        to: recipients,
        from: emailStatus.from,
        replyTo: emailStatus.replyTo,
        subject: copy.subject,
        text: `${copy.text}\n\nWith warm wishes from Anthony, Dawn, and the Bur Oaks team.`,
        html: emailHtml(event, copy.heading, copy.text),
      })
      await finalizeDelivery(client, reservation.id, result)
      summary.email = result.sent ? 'sent' : 'failed'
      if (!result.sent) summary.errors.push(result.error || 'Email failed.')
    }
  }

  const phone = camper.sms_opt_in && isTwilioConfigured() ? smsRecipient(camper, event.profile) : ''
  if (phone) {
    const reservation = await reserveDelivery(client, camper.id, event, today.year, 'sms', phone, null, copy.sms)
    if (reservation.reserved && reservation.id) {
      const result = await sendTwilioSms({ to: phone, body: copy.sms })
      const deliveryResult = result.sent
        ? { sent: true, provider: 'twilio', providerMessageId: result.providerMessageId }
        : { sent: false, provider: 'twilio', error: result.error }
      await finalizeDelivery(client, reservation.id, deliveryResult)
      summary.sms = result.sent ? 'sent' : 'failed'
      if (!result.sent) summary.errors.push(result.error)
    }
  }

  return summary
}
