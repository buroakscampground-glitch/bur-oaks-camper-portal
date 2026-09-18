import { portalInviteEmailProviderStatus } from './portal-invite-email.ts'
import { buildWaitlistConfirmation } from './waitlist-confirmation-copy.ts'

type WaitlistConfirmationInput = {
  to: string
  firstName: string
}

export type WaitlistEmailCopy = {
  subject: string
  text: string
  html: string
}

function parseSender(value: string) {
  const trimmed = value.trim()
  const match = trimmed.match(/^(.*?)<([^>]+)>$/)

  if (match) {
    return {
      name: match[1].trim().replace(/^"|"$/g, '') || undefined,
      email: match[2].trim(),
    }
  }

  return { email: trimmed }
}

export async function sendWaitlistEmail(to: string, copy: WaitlistEmailCopy) {
  const recipient = to.trim().toLowerCase()
  if (!recipient) return { skipped: true, reason: 'No applicant email address was provided.' }

  const providerStatus = portalInviteEmailProviderStatus()
  if (!providerStatus.configured) {
    throw new Error(providerStatus.reason || 'The waitlist confirmation email sender is not connected.')
  }

  if (providerStatus.provider === 'sendgrid') {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: recipient }], subject: copy.subject }],
        from: parseSender(providerStatus.from),
        reply_to: { email: parseSender(providerStatus.replyTo).email },
        content: [
          { type: 'text/plain', value: copy.text },
          { type: 'text/html', value: copy.html },
        ],
      }),
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      throw new Error(errorText || `SendGrid rejected the waitlist email with status ${response.status}.`)
    }

    return { provider: 'sendgrid', id: response.headers.get('x-message-id') || null }
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: providerStatus.from,
      to: recipient,
      reply_to: providerStatus.replyTo,
      subject: copy.subject,
      html: copy.html,
      text: copy.text,
    }),
  })
  const result = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(result?.message || 'The waitlist confirmation email could not be sent.')
  }

  return { ...result, provider: 'resend' }
}

export async function sendWaitlistConfirmationEmail({ to, firstName }: WaitlistConfirmationInput) {
  return sendWaitlistEmail(to, buildWaitlistConfirmation(firstName))
}
