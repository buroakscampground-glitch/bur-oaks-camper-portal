import { escapeHtml } from './portal-invite-email'

type AdminAlertEmailInput = {
  subject: string
  heading: string
  message: string
  details?: Array<{ label: string; value: string | number | null | undefined }>
  actionUrl?: string
  actionLabel?: string
}

export function adminAlertEmailConfigured() {
  return Boolean(process.env.RESEND_API_KEY)
}

export async function sendAdminAlertEmail({
  subject,
  heading,
  message,
  details = [],
  actionUrl,
  actionLabel = 'Open admin portal',
}: AdminAlertEmailInput) {
  const apiKey = process.env.RESEND_API_KEY

  if (!apiKey) {
    return { skipped: true, reason: 'RESEND_API_KEY is not configured.' }
  }

  const to = process.env.ADMIN_ALERT_EMAIL || 'buroakscampground@gmail.com'
  const from =
    process.env.PORTAL_INVITE_FROM ||
    process.env.ADMIN_ALERT_FROM ||
    'Bur Oaks Campground <onboarding@resend.dev>'
  const replyTo =
    process.env.PORTAL_INVITE_REPLY_TO ||
    process.env.ADMIN_ALERT_REPLY_TO ||
    'buroakscampground@gmail.com'

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

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
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
    throw new Error(result?.message || 'The admin alert email could not be sent.')
  }

  return result
}
