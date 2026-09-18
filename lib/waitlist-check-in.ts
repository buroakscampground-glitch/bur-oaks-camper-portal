import { createHmac, timingSafeEqual } from 'crypto'
import { sendWaitlistEmail } from './waitlist-confirmation-email.ts'

const CHECK_IN_INTERVAL_DAYS = 30

type WaitlistTokenPayload = {
  id: string
  email: string
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function signingSecret() {
  return process.env.WAITLIST_UNSUBSCRIBE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
}

function signature(encodedPayload: string, secret: string) {
  return createHmac('sha256', secret).update(encodedPayload).digest('base64url')
}

export function createWaitlistManageToken(payload: WaitlistTokenPayload, secret = signingSecret()) {
  if (!secret) throw new Error('Waitlist removal links are not configured.')
  const normalized: WaitlistTokenPayload = {
    id: String(payload.id || '').trim(),
    email: String(payload.email || '').trim().toLowerCase(),
  }
  if (!normalized.id || !normalized.email) throw new Error('Waitlist removal link details are incomplete.')
  const encoded = Buffer.from(JSON.stringify(normalized)).toString('base64url')
  return `${encoded}.${signature(encoded, secret)}`
}

export function readWaitlistManageToken(token: string, secret = signingSecret()): WaitlistTokenPayload | null {
  if (!secret) return null
  const [encoded, supplied, extra] = String(token || '').split('.')
  if (!encoded || !supplied || extra) return null
  const expected = signature(encoded, secret)
  const expectedBytes = Buffer.from(expected)
  const suppliedBytes = Buffer.from(supplied)
  if (expectedBytes.length !== suppliedBytes.length || !timingSafeEqual(expectedBytes, suppliedBytes)) return null

  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'))
    const id = String(parsed?.id || '').trim()
    const email = String(parsed?.email || '').trim().toLowerCase()
    return id && email ? { id, email } : null
  } catch {
    return null
  }
}

export function waitlistCheckInIsDue(
  createdAt: string,
  lastCheckInAt: string | null | undefined,
  now = new Date(),
) {
  if (!lastCheckInAt) return true
  const anchor = new Date(lastCheckInAt || createdAt)
  if (Number.isNaN(anchor.getTime())) return false
  return now.getTime() - anchor.getTime() >= CHECK_IN_INTERVAL_DAYS * 24 * 60 * 60 * 1000
}

export function buildWaitlistCheckIn(firstName: string, manageUrl: string) {
  const name = firstName.trim() || 'there'
  const safeName = escapeHtml(name)
  const safeUrl = escapeHtml(manageUrl)
  const subject = 'A quick update from Bur Oaks Campground'
  const text = [
    `Hi ${name},`,
    '',
    "We haven't forgotten about you. Your information is still active on the Bur Oaks seasonal-site waitlist, and we're excited about the possibility of welcoming you to the Bur Oaks family.",
    '',
    "We're waiting for the right site to open - one that is a good fit for you and your camper. Openings are limited and timing varies, but we will contact you when a suitable opportunity becomes available.",
    '',
    'No action is needed to remain on the waitlist.',
    '',
    `If your plans have changed, you can remove your name here: ${manageUrl}`,
    '',
    'Bur Oaks Campground',
    '(618) 488-7927',
    'buroakscampground@gmail.com',
    '',
    'A Site to Remember · Est. 1972',
  ].join('\n')
  const html = `
    <div style="font-family:Arial,sans-serif;background:#f5f1e8;padding:28px;color:#26382d">
      <div style="max-width:620px;margin:0 auto;background:#fff;border-radius:18px;overflow:hidden;border:1px solid #e2dccf">
        <div style="background:#214b31;color:#fff;padding:24px 28px">
          <div style="font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#d8c18b;font-weight:700">Bur Oaks Campground</div>
          <h1 style="margin:8px 0 0;font-family:Georgia,serif;font-weight:500">We haven't forgotten about you.</h1>
        </div>
        <div style="padding:28px">
          <p style="font-size:16px;line-height:1.6">Hi ${safeName},</p>
          <p style="font-size:16px;line-height:1.6">Your information is still active on the Bur Oaks seasonal-site waitlist, and we're excited about the possibility of welcoming you to the <strong>Bur Oaks family.</strong></p>
          <div style="margin:20px 0;padding:18px;border-left:4px solid #2f5b3b;background:#f4f7f1;border-radius:12px;line-height:1.6">
            We're waiting for the right site to open—one that is a good fit for you and your camper. Openings are limited and timing varies, but we will contact you when a suitable opportunity becomes available.
          </div>
          <p style="font-size:16px;line-height:1.6"><strong>No action is needed to remain on the waitlist.</strong></p>
          <p style="font-size:15px;line-height:1.7"><strong>Bur Oaks Campground</strong><br><a href="tel:+16184887927" style="color:#2f5b3b">(618) 488-7927</a><br><a href="mailto:buroakscampground@gmail.com" style="color:#2f5b3b">buroakscampground@gmail.com</a></p>
          <p style="margin:28px 0 0;padding-top:20px;border-top:1px solid #e2dccf;font-size:13px;line-height:1.6;color:#68756c">Plans changed? <a href="${safeUrl}" style="color:#2f5b3b;font-weight:700">Remove my name from the waitlist</a>.</p>
          <p style="margin-bottom:0;font-family:Georgia,serif;color:#8a6c35">A Site to Remember · Est. 1972</p>
        </div>
      </div>
    </div>
  `

  return { subject, text, html }
}

export async function sendWaitlistCheckInEmail(input: {
  to: string
  firstName: string
  manageUrl: string
}) {
  return sendWaitlistEmail(input.to, buildWaitlistCheckIn(input.firstName, input.manageUrl))
}

export function waitlistRemovalAlert(entry: { first_name?: unknown; last_name?: unknown; email?: unknown }) {
  const name = `${String(entry.first_name || '').trim()} ${String(entry.last_name || '').trim()}`.trim() || 'A waitlist applicant'
  const email = String(entry.email || '').trim().toLowerCase()
  return {
    title: `Waitlist removal: ${name}`,
    message: `${name}${email ? ` (${email})` : ''} removed their name from the seasonal-site waitlist.`,
  }
}

export { CHECK_IN_INTERVAL_DAYS }
