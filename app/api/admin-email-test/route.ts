import { NextResponse } from 'next/server'
import { sendAdminAlertEmail } from '../../../lib/admin-alert-email'
import { getAuthenticatedContext } from '../../../lib/server-auth'

export const runtime = 'nodejs'

function maskEmail(value: string) {
  const [name, domain] = value.split('@')
  if (!domain) return value
  return `${name.slice(0, 2)}***@${domain}`
}

function adminAlertRecipients() {
  const raw =
    process.env.ADMIN_ALERT_EMAILS ||
    process.env.ADMIN_ALERT_EMAIL ||
    'buroakscampground@gmail.com'

  return raw
    .split(',')
    .map((email) => email.trim())
    .filter(Boolean)
}

export async function POST(request: Request) {
  const context = await getAuthenticatedContext(request)

  if (!context || String(context.camper.role || '').toLowerCase() !== 'admin') {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  const to = adminAlertRecipients()
  const from =
    process.env.ADMIN_ALERT_FROM ||
    process.env.PORTAL_INVITE_FROM ||
    'Bur Oaks Campground <onboarding@resend.dev>'
  const replyTo =
    process.env.ADMIN_ALERT_REPLY_TO ||
    process.env.PORTAL_INVITE_REPLY_TO ||
    'buroakscampground@gmail.com'

  try {
    const result = await sendAdminAlertEmail({
      subject: 'Bur Oaks test admin alert',
      heading: 'Test admin email alert',
      message: 'This is a test email from the Bur Oaks Camper Portal. If you received this, maintenance and payment alert email delivery is connected.',
      details: [
        { label: 'Sent to', value: to.join(', ') },
        { label: 'Sent from', value: from },
        { label: 'Reply-to', value: replyTo },
        { label: 'Triggered by', value: context.user.email },
      ],
      actionUrl: `${new URL(request.url).origin}/admin`,
      actionLabel: 'Open admin dashboard',
    })

    if ((result as any)?.skipped) {
      return NextResponse.json({
        success: false,
        status: 'skipped',
        message: (result as any).reason || 'Email alert is not configured.',
        configured: {
          hasResendKey: Boolean(process.env.RESEND_API_KEY),
          to: to.map(maskEmail).join(', '),
          from,
          replyTo: maskEmail(replyTo),
        },
      })
    }

    return NextResponse.json({
      success: true,
      status: 'sent',
      message: `Test email sent to ${to.map(maskEmail).join(', ')}.`,
      configured: {
        hasResendKey: Boolean(process.env.RESEND_API_KEY),
        to: to.map(maskEmail).join(', '),
        from,
        replyTo: maskEmail(replyTo),
      },
    })
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      status: 'failed',
      message: error?.message || 'Test email failed.',
      configured: {
        hasResendKey: Boolean(process.env.RESEND_API_KEY),
        to: to.map(maskEmail).join(', '),
        from,
        replyTo: maskEmail(replyTo),
      },
    }, { status: 500 })
  }
}
