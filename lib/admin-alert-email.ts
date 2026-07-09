import { escapeHtml } from './portal-invite-email'

type AdminAlertEmailInput = {
  subject: string
  heading: string
  message: string
  details?: Array<{ label: string; value: string | number | null | undefined }>
  actionUrl?: string
  actionLabel?: string
  recipients?: string[]
}

type EmailProvider = 'sendgrid' | 'resend'

export function adminAlertEmailConfigured() {
  return Boolean(process.env.SENDGRID_API_KEY || process.env.RESEND_API_KEY)
}

export function adminAlertRecipients() {
  const raw =
    process.env.ADMIN_ALERT_EMAILS ||
    process.env.ADMIN_ALERT_EMAIL ||
    'buroakscampground@gmail.com'

  return raw
    .split(',')
    .map((email) => email.trim())
    .filter(Boolean)
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

function senderEmail(value: string) {
  return parseSender(value).email
}

function isResendTestSender(from: string) {
  return /<\s*onboarding@resend\.dev\s*>/i.test(from) || /(^|\s)onboarding@resend\.dev(\s|$)/i.test(from)
}

function adminAlertFrom() {
  return (
    process.env.SENDGRID_FROM ||
    process.env.ADMIN_ALERT_FROM ||
    process.env.CAMPER_MESSAGE_FROM ||
    process.env.INVOICE_EMAIL_FROM ||
    process.env.PORTAL_INVITE_FROM ||
    ''
  ).trim()
}

function adminAlertReplyTo() {
  return (
    process.env.SENDGRID_REPLY_TO ||
    process.env.ADMIN_ALERT_REPLY_TO ||
    process.env.CAMPER_MESSAGE_REPLY_TO ||
    process.env.INVOICE_EMAIL_REPLY_TO ||
    process.env.PORTAL_INVITE_REPLY_TO ||
    'buroakscampground@gmail.com'
  ).trim()
}

export function adminAlertEmailProviderStatus() {
  const from = adminAlertFrom()
  const replyTo = adminAlertReplyTo()

  if (process.env.SENDGRID_API_KEY) {
    return {
      provider: 'sendgrid' as EmailProvider,
      configured: Boolean(from),
      from,
      replyTo,
      reason: from ? '' : 'SENDGRID_FROM or ADMIN_ALERT_FROM is not configured.',
    }
  }

  if (process.env.RESEND_API_KEY) {
    return {
      provider: 'resend' as EmailProvider,
      configured: Boolean(from) && !isResendTestSender(from),
      from: from || 'Bur Oaks Campground <onboarding@resend.dev>',
      replyTo,
      reason:
        !from || isResendTestSender(from)
          ? 'Resend needs a verified sending domain. The current sender is missing or uses the Resend test sender.'
          : '',
    }
  }

  return {
    provider: null,
    configured: false,
    from,
    replyTo,
    reason: 'No admin alert email provider is configured. Add SENDGRID_API_KEY or RESEND_API_KEY.',
  }
}

export async function sendAdminAlertEmail({
  subject,
  heading,
  message,
  details = [],
  actionUrl,
  actionLabel = 'Open admin portal',
  recipients,
}: AdminAlertEmailInput) {
  const providerStatus = adminAlertEmailProviderStatus()

  if (!providerStatus.configured || !providerStatus.provider) {
    return { skipped: true, reason: providerStatus.reason || 'Admin alert email is not configured.' }
  }

  const to = (recipients?.length ? recipients : adminAlertRecipients())
    .map((email) => email.trim())
    .filter(Boolean)
  const from = providerStatus.from
  const replyTo = providerStatus.replyTo

  const visibleDetails = details.filter((detail) => detail.value !== null && detail.value !== undefined && detail.value !== '')
  const text = [
    heading,
    '',
    message,
    '',
    ...visibleDetails.map((detail) => `${detail.label}: ${detail.value}`),
    actionUrl ? `\nOpen: ${actionUrl}` : '',
  ].join('\n')

  const detailRows = visibleDetails
    .map(
      (detail) => `
        <tr>
          <td style="padding:9px 0;color:#718078;font-size:13px">${escapeHtml(detail.label)}</td>
          <td style="padding:9px 0;text-align:right;color:#26382d;font-weight:700;font-size:13px">${escapeHtml(String(detail.value))}</td>
        </tr>
      `
    )
    .join('')

  const html = `
    <div style="font-family:Arial,sans-serif;background:#f5f1e8;padding:28px;color:#26382d">
      <div style="max-width:620px;margin:0 auto;background:#fff;border-radius:18px;overflow:hidden;border:1px solid #e2dccf">
        <div style="background:#214b31;color:#fff;padding:24px 28px">
          <div style="font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#d8c18b;font-weight:700">Bur Oaks admin alert</div>
          <h1 style="margin:8px 0 0;font-family:Georgia,serif;font-weight:500">${escapeHtml(heading)}</h1>
        </div>
        <div style="padding:28px">
          <p style="font-size:16px;line-height:1.55;margin-top:0">${escapeHtml(message)}</p>
          ${
            detailRows
              ? `<table style="width:100%;border-collapse:collapse;margin:18px 0;border-top:1px solid #e8e1d4;border-bottom:1px solid #e8e1d4">${detailRows}</table>`
              : ''
          }
          ${
            actionUrl
              ? `<a href="${actionUrl}" style="display:inline-block;margin-top:6px;background:#2f5b3b;color:#fff;text-decoration:none;padding:13px 17px;border-radius:12px;font-weight:700">${escapeHtml(actionLabel)}</a>`
              : ''
          }
        </div>
      </div>
    </div>
  `

  if (providerStatus.provider === 'sendgrid') {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [
          {
            to: to.map((email) => ({ email })),
            subject,
          },
        ],
        from: parseSender(from),
        reply_to: { email: senderEmail(replyTo) },
        content: [
          { type: 'text/plain', value: text },
          { type: 'text/html', value: html },
        ],
      }),
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      console.error('Admin alert email rejected by SendGrid:', {
        subject,
        status: response.status,
        message: errorText,
      })
      throw new Error(errorText || `SendGrid rejected the admin alert email with status ${response.status}.`)
    }

    const id = response.headers.get('x-message-id') || null
    console.info('Admin alert email accepted by SendGrid:', {
      subject,
      id,
      recipients: to.length,
    })

    return { provider: 'sendgrid', id, recipients: to.length }
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to,
      reply_to: replyTo,
      subject,
      html,
      text,
    }),
  })

  const result = await response.json().catch(() => ({}))

  if (!response.ok) {
    console.error('Admin alert email rejected by Resend:', {
      subject,
      status: response.status,
      message: result?.message,
      name: result?.name,
    })
    throw new Error(result?.message || 'The admin alert email could not be sent.')
  }

  console.info('Admin alert email accepted by Resend:', {
    subject,
    id: result?.id,
    recipients: to.length,
  })

  return result
}
