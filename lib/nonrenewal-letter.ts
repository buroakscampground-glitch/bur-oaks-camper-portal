import { buildNonRenewalLetter, type NonRenewalCamper } from './nonrenewal-letter-copy'

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
    process.env.SENDGRID_FROM ||
    process.env.CAMPER_MESSAGE_FROM ||
    process.env.ADMIN_ALERT_FROM ||
    process.env.INVOICE_EMAIL_FROM ||
    process.env.PORTAL_INVITE_FROM ||
    ''
  ).trim()
  const replyTo = (
    process.env.SENDGRID_REPLY_TO ||
    process.env.CAMPER_MESSAGE_REPLY_TO ||
    process.env.ADMIN_ALERT_REPLY_TO ||
    process.env.INVOICE_EMAIL_REPLY_TO ||
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

export async function sendNonRenewalLetter(camper: NonRenewalCamper, contractEndDate: string) {
  const recipients = uniqueEmails([camper.email, camper.secondary_email])
  if (!recipients.length) throw new Error('This camper does not have a deliverable email address.')

  const status = emailStatus()
  if (!status.configured || !status.provider) throw new Error('The campground email sender is not configured.')

  const letter = buildNonRenewalLetter(camper, contractEndDate)

  if (status.provider === 'sendgrid') {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: recipients.map((email) => ({ to: [{ email }], subject: letter.subject })),
        from: parseSender(status.from),
        reply_to: { email: senderEmail(status.replyTo) },
        content: [{ type: 'text/plain', value: letter.text }, { type: 'text/html', value: letter.html }],
      }),
    })
    if (!response.ok) {
      throw new Error(await response.text().catch(() => `SendGrid rejected the letter with status ${response.status}.`))
    }
    return { provider: status.provider, providerMessageId: response.headers.get('x-message-id') || null, recipients: recipients.length }
  }

  const results = []
  for (const recipient of recipients) {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: status.from, to: [recipient], reply_to: status.replyTo, subject: letter.subject, html: letter.html, text: letter.text }),
    })
    const result = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(result?.message || 'Resend rejected the non-renewal letter.')
    results.push(result?.id || null)
  }

  return { provider: status.provider, providerMessageId: results.filter(Boolean).join(',') || null, recipients: recipients.length }
}
