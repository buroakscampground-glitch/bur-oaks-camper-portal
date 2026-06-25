import { escapeHtml } from './portal-invite-email'

type CamperMessageEmailInput = {
  to: string[]
  camperName: string
  lotNumber?: string | null
  message: string
  actionUrl: string
}

export async function sendCamperMessageEmail({
  to,
  camperName,
  lotNumber,
  message,
  actionUrl,
}: CamperMessageEmailInput) {
  const apiKey = process.env.RESEND_API_KEY

  if (!apiKey) {
    return { skipped: true, reason: 'RESEND_API_KEY is not configured.' }
  }

  const recipients = to.map((email) => email.trim()).filter(Boolean)

  if (recipients.length === 0) {
    return { skipped: true, reason: 'No camper email address is on file.' }
  }

  const from =
    process.env.CAMPER_MESSAGE_FROM ||
    process.env.PORTAL_INVITE_FROM ||
    process.env.ADMIN_ALERT_FROM ||
    'Bur Oaks Campground <onboarding@resend.dev>'
  const replyTo =
    process.env.CAMPER_MESSAGE_REPLY_TO ||
    process.env.ADMIN_ALERT_REPLY_TO ||
    process.env.PORTAL_INVITE_REPLY_TO ||
    'buroakscampground@gmail.com'

  const subject = `New message from Bur Oaks${lotNumber ? ` for Lot ${lotNumber}` : ''}`
  const text = [
    `Hi ${camperName || 'there'},`,
    '',
    'Bur Oaks Campground sent you a new portal message:',
    '',
    message,
    '',
    `Read and reply here: ${actionUrl}`,
  ].join('\n')

  const html = `
    <div style="font-family:Arial,sans-serif;background:#f5f1e8;padding:28px;color:#26382d">
      <div style="max-width:620px;margin:0 auto;background:#fff;border-radius:18px;overflow:hidden;border:1px solid #e2dccf">
        <div style="background:#214b31;color:#fff;padding:24px 28px">
          <div style="font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#d8c18b;font-weight:700">Bur Oaks Campground</div>
          <h1 style="margin:8px 0 0;font-family:Georgia,serif;font-weight:500">You have a new message</h1>
        </div>
        <div style="padding:28px">
          <p style="font-size:16px;line-height:1.55;margin-top:0">Hi ${escapeHtml(camperName || 'there')}, the office sent you a new message${lotNumber ? ` for Lot ${escapeHtml(String(lotNumber))}` : ''}.</p>
          <div style="margin:18px 0;padding:18px;border-left:4px solid #2f5b3b;background:#f4f7f1;border-radius:12px;color:#26382d;line-height:1.55">
            ${escapeHtml(message).replace(/\n/g, '<br />')}
          </div>
          <a href="${actionUrl}" style="display:inline-block;margin-top:6px;background:#2f5b3b;color:#fff;text-decoration:none;padding:13px 17px;border-radius:12px;font-weight:700">Open my messages</a>
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
      to: recipients,
      reply_to: replyTo,
      subject,
      html,
      text,
    }),
  })

  const result = await response.json().catch(() => ({}))

  if (!response.ok) {
    console.error('Camper message email rejected by Resend:', {
      subject,
      status: response.status,
      message: result?.message,
      name: result?.name,
    })
    throw new Error(result?.message || 'The camper message email could not be sent.')
  }

  return result
}
