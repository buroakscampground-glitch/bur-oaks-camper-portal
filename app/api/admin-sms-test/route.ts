import { NextResponse } from 'next/server'
import { getAuthenticatedContext } from '../../../lib/server-auth'
import { singleSegmentSms } from '../../../lib/sms-segments'
import { formatSmsPhone, sendTwilioSms } from '../../../lib/twilio-sms'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const context = await getAuthenticatedContext(request)
  if (!context || String(context.camper.role || '').toLowerCase() !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const phone = formatSmsPhone(body.phone)
  if (!phone) {
    return NextResponse.json({ error: 'Enter a valid mobile number.' }, { status: 400 })
  }

  const message = singleSegmentSms({
    message: 'TEST ONLY - !!! BILL DUE TOMORROW !!! Lot 3: $242.41, due Sep 12.',
    url: 'https://www.buroakscampground.com/invoices',
    action: 'Pay',
  })
  const result = await sendTwilioSms({ to: phone, body: message })

  if (!result.sent) {
    return NextResponse.json({ error: result.error }, { status: 502 })
  }

  return NextResponse.json({
    success: true,
    message,
    recipient: `***-***-${phone.slice(-4)}`,
    providerMessageId: result.providerMessageId,
  })
}
