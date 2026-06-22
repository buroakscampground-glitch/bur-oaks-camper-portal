type InviteEmailInput = {
  to: string
  camperName: string
  setupUrl: string
}

export function portalInviteEmailConfigured() {
  return Boolean(process.env.RESEND_API_KEY)
}

export async function sendPortalInviteEmail({
  to,
  camperName,
  setupUrl,
}: InviteEmailInput) {
  const apiKey = process.env.RESEND_API_KEY
  const from =
    process.env.PORTAL_INVITE_FROM ||
    'Bur Oaks Campground <onboarding@resend.dev>'
  const replyTo =
    process.env.PORTAL_INVITE_REPLY_TO ||
    'buroakscampground@gmail.com'

  if (!apiKey) {
    throw new Error('Email sender is not connected yet. Add RESEND_API_KEY in Vercel.')
  }

  const firstName = camperName.trim().split(/\s+/)[0] || 'there'
  const subject = 'Set up your Bur Oaks Camper Portal'
  const text = [
    `Hi ${firstName},`,
    '',
    'Bur Oaks Campground has created your camper portal account.',
    'Use the secure link below to create your password:',
    '',
    setupUrl,
    '',
    'This link is private to you. If you did not request this, please contact the campground office.',
    '',
    'Bur Oaks Campground',
  ].join('\n')

  const html = `
    <div style="font-family:Arial,sans-serif;background:#f5f1e8;padding:28px;color:#26382d">
      <div style="max-width:620px;margin:0 auto;background:#fff;border-radius:18px;overflow:hidden;border:1px solid #e2dccf">
        <div style="background:#214b31;color:#fff;padding:24px 28px">
          <div style="font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#d8c18b;font-weight:700">Bur Oaks Campground</div>
          <h1 style="margin:8px 0 0;font-family:Georgia,serif;font-weight:500">Your camper portal is ready.</h1>
        </div>
        <div style="padding:28px">
          <p style="font-size:16px;line-height:1.55">Hi ${escapeHtml(firstName)},</p>
          <p style="font-size:16px;line-height:1.55">We created your Bur Oaks Camper Portal account so you can view documents, invoices, events, weather, maintenance requests, and campground updates in one place.</p>
          <a href="${setupUrl}" style="display:inline-block;margin:14px 0 18px;background:#2f5b3b;color:#fff;text-decoration:none;padding:14px 18px;border-radius:12px;font-weight:700">Create My Password</a>
          <p style="font-size:13px;line-height:1.5;color:#69766d">If the button does not work, copy and paste this link into your browser:<br><span style="word-break:break-all">${setupUrl}</span></p>
          <p style="font-size:13px;line-height:1.5;color:#69766d">This link is private to you. If you did not request this, please contact the campground office.</p>
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
    throw new Error(result?.message || 'The invite email could not be sent.')
  }

  return result
}

export function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}
