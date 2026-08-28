import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

const ONE_TIME_KEY = '66e9305eda2da5f3bbbb5669e09d6c90f104112d0fa3d593'
const EMAIL = 'peggybartz@sbcglobal.net'

async function sendgrid(path: string) {
  const response = await fetch(`https://api.sendgrid.com/v3${path}`, {
    headers: { Authorization: `Bearer ${process.env.SENDGRID_API_KEY}` },
    cache: 'no-store',
  })
  const body = await response.json().catch(() => null)
  return { status: response.status, ok: response.ok, body }
}

export async function GET(request: Request) {
  if (request.headers.get('x-one-time-key') !== ONE_TIME_KEY) return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  if (!process.env.SENDGRID_API_KEY) return NextResponse.json({ error: 'SendGrid is not configured.' }, { status: 500 })

  const encodedEmail = encodeURIComponent(EMAIL)
  const query = encodeURIComponent(`to_email="${EMAIL}"`)
  const [activity, bounce, block, spam, invalid, globalUnsubscribe] = await Promise.all([
    sendgrid(`/messages?query=${query}&limit=20`),
    sendgrid(`/suppression/bounces/${encodedEmail}`),
    sendgrid(`/suppression/blocks/${encodedEmail}`),
    sendgrid(`/suppression/spam_reports/${encodedEmail}`),
    sendgrid(`/suppression/invalid_emails/${encodedEmail}`),
    sendgrid(`/asm/suppressions/global/${encodedEmail}`),
  ])

  const messages = Array.isArray(activity.body?.messages) ? activity.body.messages : []
  return NextResponse.json({
    email: EMAIL,
    activityAccess: activity.ok,
    activityStatus: activity.status,
    messages: messages.slice(0, 10).map((message: any) => ({
      status: message.status || null,
      subject: message.subject || null,
      lastEventTime: message.last_event_time || null,
      reason: message.reason || null,
      eventCount: Array.isArray(message.events) ? message.events.length : null,
    })),
    suppressions: {
      bounce: bounce.ok,
      block: block.ok,
      spam: spam.ok,
      invalid: invalid.ok,
      globalUnsubscribe: globalUnsubscribe.ok,
    },
    diagnosticStatuses: {
      bounce: bounce.status,
      block: block.status,
      spam: spam.status,
      invalid: invalid.status,
      globalUnsubscribe: globalUnsubscribe.status,
    },
  })
}
