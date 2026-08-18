type InviteEmailInput = {
  to: string
  camperName: string
  setupUrl: string
}

export function portalInviteEmailConfigured() {
  return Boolean(process.env.SENDGRID_API_KEY || process.env.RESEND_API_KEY)
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

function inviteFrom() {
  return (
    process.env.SENDGRID_FROM ||
    process.env.PORTAL_INVITE_FROM ||
    process.env.CAMPER_MESSAGE_FROM ||
    process.env.INVOICE_EMAIL_FROM ||
    process.env.ADMIN_ALERT_FROM ||
    ''
  ).trim()
}

function inviteReplyTo() {
  return (
    process.env.SENDGRID_REPLY_TO ||
    process.env.PORTAL_INVITE_REPLY_TO ||
    process.env.CAMPER_MESSAGE_REPLY_TO ||
    process.env.ADMIN_ALERT_REPLY_TO ||
    process.env.INVOICE_EMAIL_REPLY_TO ||
    'buroakscampground@gmail.com'
  ).trim()
}

export function portalInviteEmailProviderStatus() {
  const from = inviteFrom()

  if (process.env.SENDGRID_API_KEY) {
    return {
      provider: 'sendgrid',
      configured: Boolean(from),
      from,
      replyTo: inviteReplyTo(),
      reason: from ? '' : 'SENDGRID_FROM or PORTAL_INVITE_FROM is not configured.',
    }
  }

  if (process.env.RESEND_API_KEY) {
    return {
      provider: 'resend',
      configured: Boolean(from) && !isResendTestSender(from),
      from: from || 'Bur Oaks Campground <onboarding@resend.dev>',
      replyTo: inviteReplyTo(),
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
    replyTo: inviteReplyTo(),
    reason: 'No portal invite email provider is configured. Add SENDGRID_API_KEY or RESEND_API_KEY.',
  }
}

export async function sendPortalInviteEmail({
  to,
  camperName,
  setupUrl,
}: InviteEmailInput) {
  const providerStatus = portalInviteEmailProviderStatus()
  const from = providerStatus.from
  const replyTo = providerStatus.replyTo

  if (!providerStatus.configured) {
    throw new Error(providerStatus.reason || 'Portal invite email sender is not connected yet.')
  }

  const firstName = camperName.trim().split(/\s+/)[0] || 'there'
  const subject = 'Action needed: Set up your Bur Oaks Camper Portal within 24 hours'
  const text = [
    `Hi ${firstName},`,
    '',
    'Bur Oaks Campground has created or refreshed your camper portal setup link.',
    'Please use the newest secure link below and complete your portal setup within 24 hours:',
    '',
    setupUrl,
    '',
    'IMPORTANT: This one-time setup link expires after 24 hours. Please set up your portal now. If you do not complete setup, you will lose access to Bur Oaks information available through the camper portal until the office sends you a new link.',
    'Questions or setup help: Contact Anthony at 618-882-8063.',
    'This link is private to you. If you did not request this, please contact the campground office.',
    '',
    'Bur Oaks Campground',
  ].join('\n')

  const html = `
    <div style="font-family:Arial,sans-serif;background:#f5f1e8;padding:28px;color:#26382d">
      <div style="max-width:620px;margin:0 auto;background:#fff;border-radius:18px;overflow:hidden;border:1px solid #e2dccf">
        <div style="background:#214b31;color:#fff;padding:24px 28px">
          <div style="font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#d8c18b;font-weight:700">Bur Oaks Campground</div>
          <h1 style="margin:8px 0 0;font-family:Georgia,serif;font-weight:500">Please set up your camper portal within 24 hours.</h1>
        </div>
        <div style="padding:28px">
          <p style="font-size:16px;line-height:1.55">Hi ${escapeHtml(firstName)},</p>
          <p style="font-size:16px;line-height:1.55">We created or refreshed your Bur Oaks Camper Portal setup link so you can view documents, invoices, events, weather, maintenance requests, office messages, and campground updates in one place.</p>
          <div style="margin:18px 0;padding:16px;border-radius:12px;background:#fff3d6;border:1px solid #ead298;color:#6d5018;font-size:15px;line-height:1.55"><strong>Action required:</strong> Please complete your portal setup within 24 hours. This one-time link will expire after 24 hours.</div>
          <a href="${setupUrl}" style="display:inline-block;margin:4px 0 18px;background:#2f5b3b;color:#fff;text-decoration:none;padding:14px 18px;border-radius:12px;font-weight:700">Set Up My Camper Portal Now</a>
          <p style="font-size:13px;line-height:1.5;color:#69766d">If the button does not work, copy and paste this link into your browser:<br><span style="word-break:break-all">${setupUrl}</span></p>
          <p style="font-size:13px;line-height:1.5;color:#69766d"><strong>Important:</strong> If you do not complete setup within 24 hours, you will lose access to the Bur Oaks information available through the camper portal until the office sends you a new link. If you received more than one setup email, use only the newest link.</p>
          <p style="font-size:14px;line-height:1.5;color:#26382d"><strong>Questions or setup help?</strong><br>Contact Anthony at <a href="tel:+16188828063" style="color:#2f5b3b;font-weight:700">618-882-8063</a>.</p>
          <p style="font-size:13px;line-height:1.5;color:#69766d">This link is private to you. If you did not request this, please contact the campground office.</p>
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
            to: [{ email: to }],
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
      throw new Error(errorText || `SendGrid rejected the invite email with status ${response.status}.`)
    }

    return {
      provider: 'sendgrid',
      id: response.headers.get('x-message-id') || null,
    }
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
    throw new Error(result?.message || 'The invite email could not be sent.')
  }

  return { ...result, provider: 'resend' }
}

export function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}
