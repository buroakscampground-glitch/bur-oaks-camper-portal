import { NextResponse } from 'next/server'
import { adminAlertEmailProviderStatus, adminAlertRecipients, sendAdminAlertEmail } from '../../../lib/admin-alert-email'
import { getAuthenticatedContext } from '../../../lib/server-auth'
import { getSiteUrl } from '../../../lib/site-url'

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

  const to = adminAlertRecipients()
  const providerStatus = adminAlertEmailProviderStatus()
  const from = providerStatus.from
  const replyTo = providerStatus.replyTo

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
      actionUrl: `${getSiteUrl()}/admin`,
      actionLabel: 'Open admin dashboard',
    })

    if ((result as any)?.skipped) {
      return NextResponse.json({
        success: false,
        status: 'skipped',
        message: (result as any).reason || 'Email alert is not configured.',
        configured: {
          provider: providerStatus.provider,
          ready: providerStatus.configured,
          to: to.map(maskEmail).join(', '),
          from,
          replyTo: maskEmail(replyTo),
          reason: providerStatus.reason,
        },
      })
    }

    return NextResponse.json({
      success: true,
      status: 'sent',
      message: `Test email sent to ${to.map(maskEmail).join(', ')}.`,
      configured: {
        provider: providerStatus.provider,
        ready: providerStatus.configured,
        to: to.map(maskEmail).join(', '),
        from,
        replyTo: maskEmail(replyTo),
        reason: providerStatus.reason,
      },
    })
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      status: 'failed',
      message: error?.message || 'Test email failed.',
      configured: {
        provider: providerStatus.provider,
        ready: providerStatus.configured,
        to: to.map(maskEmail).join(', '),
        from,
        replyTo: maskEmail(replyTo),
        reason: providerStatus.reason,
      },
    }, { status: 500 })
  }
}
