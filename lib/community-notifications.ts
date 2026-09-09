type CommunityEmailInput = {
  to: string[]
  camperName: string
  subject: string
  heading: string
  message: string
  actionUrl: string
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character] || character))
}

export type CommunityNotificationMode = 'daily_summary' | 'right_away' | 'portal_only'

export const defaultCommunityPreferences = {
  community_mode: 'daily_summary' as CommunityNotificationMode,
  replies_mode: 'right_away' as CommunityNotificationMode,
  official_mode: 'right_away' as CommunityNotificationMode,
  quiet_hours_enabled: true,
}

export function normalizeCommunityMode(value: unknown): CommunityNotificationMode {
  return value === 'right_away' || value === 'portal_only' ? value : 'daily_summary'
}

export function camperCommunityEmails(camper: any) {
  return Array.from(new Set([camper?.email, camper?.secondary_email]
    .map((value) => String(value || '').trim().toLowerCase())
    .filter((value) => value.includes('@'))))
}

export async function sendCommunityEmail({
  to,
  camperName,
  subject,
  heading,
  message,
  actionUrl,
}: CommunityEmailInput) {
  const apiKey = process.env.RESEND_API_KEY
  const recipients = Array.from(new Set(to.map((email) => email.trim().toLowerCase()).filter(Boolean)))
  if (!apiKey) return { skipped: true, reason: 'RESEND_API_KEY is not configured.' }
  if (!recipients.length) return { skipped: true, reason: 'No camper email address is on file.' }

  const from = process.env.CAMPER_MESSAGE_FROM || process.env.PORTAL_INVITE_FROM || 'Bur Oaks Campground <onboarding@resend.dev>'
  const replyTo = process.env.CAMPER_MESSAGE_REPLY_TO || process.env.PORTAL_INVITE_REPLY_TO || 'buroakscampground@gmail.com'
  const safeName = escapeHtml(camperName || 'there')
  const safeHeading = escapeHtml(heading)
  const safeMessage = escapeHtml(message)
  const safeUrl = escapeHtml(actionUrl)
  const text = [`Hi ${camperName || 'there'},`, '', message, '', `Open the Bur Oaks Community: ${actionUrl}`, '', 'Community conversation alerts are email-only. Emergency and official text alerts remain separate.'].join('\n')
  const html = `
    <div style="font-family:Arial,sans-serif;background:#f5f1e8;padding:28px;color:#26382d">
      <div style="max-width:620px;margin:0 auto;background:#fff;border-radius:18px;overflow:hidden;border:1px solid #e2dccf">
        <div style="background:#214b31;color:#fff;padding:24px 28px">
          <div style="font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#e1c375;font-weight:700">Bur Oaks Campground Community</div>
          <h1 style="margin:8px 0 0;font-family:Georgia,serif;font-weight:500">${safeHeading}</h1>
        </div>
        <div style="padding:28px">
          <p style="font-size:16px;line-height:1.55;margin-top:0">Hi ${safeName},</p>
          <p style="font-size:16px;line-height:1.6">${safeMessage}</p>
          <a href="${safeUrl}" style="display:inline-block;margin-top:8px;background:#2f5b3b;color:#fff;text-decoration:none;padding:13px 17px;border-radius:12px;font-weight:700">Open the Community</a>
          <p style="font-size:12px;line-height:1.5;color:#68746c;margin-top:22px">Community conversation alerts are email-only. Emergency and official text alerts remain separate. You can change your preferences inside the Community page.</p>
        </div>
      </div>
    </div>`

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: recipients, reply_to: replyTo, subject, text, html }),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result?.message || 'The community email could not be sent.')
  return result
}
