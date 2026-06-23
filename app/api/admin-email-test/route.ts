import { NextResponse } from 'next/server'
import { sendAdminAlertEmail } from '../../../lib/admin-alert-email'
import { getAuthenticatedContext } from '../../../lib/server-auth'

export const runtime = 'nodejs'

function maskEmail(value: string) {
  const [name, domain] = value.split('@')
  if (!domain) return value
  return `${name.slice(0, 2)}***@${domain}`
}

export async function POST(request: Request) {
  const context = await getAuthenticatedContext(request)

  if (!context || String(context.camper.role || '').toLowerCase() !== 'admin') {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
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

  try {
    const result = await sendAdminAlertEmail({
      subject: 'Bur Oaks test admin alert',
      heading: 'Test admin email alert',
      message: 'This is a test email from the Bur Oaks Camper Portal. If you received this, maintenance and payment alert email delivery is connected.',
      details: [
        { label: 'Sent to', value: to },
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
          to: maskEmail(to),
          from,
          replyTo: maskEmail(replyTo),
        },
      })
    }

    return NextResponse.json({
      success: true,
      status: 'sent',
      message: `Test email sent to ${maskEmail(to)}.`,
      configured: {
        hasResendKey: Boolean(process.env.RESEND_API_KEY),
        to: maskEmail(to),
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
        to: maskEmail(to),
        from,
        replyTo: maskEmail(replyTo),
      },
    }, { status: 500 })
  }
}
