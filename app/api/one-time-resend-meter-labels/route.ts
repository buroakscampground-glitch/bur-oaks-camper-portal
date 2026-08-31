import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { buildMeterLabelsPdf } from '../../../lib/meter-labels'
import { normalizeLotKey } from '../../../lib/meter-reading'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ONE_TIME_KEY = '663adc139b82eeda8ff72e9989b396925d35887588e761c0'
const LABELS = ['FF15A', 'FF16A', 'TEMP 1']
const RECIPIENT = 'buroakscampground@gmail.com'

function parseSender(value: string) {
  const match = value.trim().match(/^(.*?)<([^>]+)>$/)
  return match
    ? { name: match[1].trim().replace(/^"|"$/g, '') || undefined, email: match[2].trim() }
    : { email: value.trim() }
}

export async function POST(request: Request) {
  if (request.headers.get('x-one-time-key') !== ONE_TIME_KEY) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const from = (process.env.SENDGRID_FROM || process.env.ADMIN_ALERT_FROM || process.env.INVOICE_EMAIL_FROM || '').trim()
  if (!url || !serviceKey || !from) return NextResponse.json({ error: 'Email or database is not configured.' }, { status: 500 })

  const admin = createClient(url, serviceKey)
  const { data: lots, error } = await admin.from('lots').select('lot_number,meter_number')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const lotByKey = new Map((lots || []).map((lot: any) => [normalizeLotKey(lot.lot_number), lot]))
  const sites = LABELS.map((label) => {
    const lot: any = lotByKey.get(normalizeLotKey(label))
    return { lot_number: lot?.lot_number || label, meter_number: lot?.meter_number || null }
  })
  const pdf = await buildMeterLabelsPdf(sites)
  const attachment = Buffer.from(pdf).toString('base64')
  const subject = 'Corrected Bur Oaks meter QR labels - FF15A, FF16A, TEMP 1'
  const text = 'Three corrected meter labels are attached. The lot names now stay clear of the QR codes.'

  if (process.env.SENDGRID_API_KEY) {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: RECIPIENT }], subject }],
        from: parseSender(from),
        reply_to: { email: parseSender(process.env.SENDGRID_REPLY_TO || RECIPIENT).email },
        content: [{ type: 'text/plain', value: text }, { type: 'text/html', value: `<p>${text}</p>` }],
        attachments: [{ content: attachment, filename: 'corrected-meter-labels-ff15a-ff16a-temp1.pdf', type: 'application/pdf', disposition: 'attachment' }],
      }),
    })
    if (!response.ok) return NextResponse.json({ error: await response.text().catch(() => `SendGrid error ${response.status}`) }, { status: 500 })
    return NextResponse.json({ success: true, recipient: RECIPIENT, labels: LABELS, provider: 'sendgrid' })
  }

  if (process.env.RESEND_API_KEY) {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [RECIPIENT],
        reply_to: process.env.SENDGRID_REPLY_TO || RECIPIENT,
        subject,
        text,
        html: `<p>${text}</p>`,
        attachments: [{ filename: 'corrected-meter-labels-ff15a-ff16a-temp1.pdf', content: attachment }],
      }),
    })
    const result = await response.json().catch(() => ({}))
    if (!response.ok) return NextResponse.json({ error: result.message || `Resend error ${response.status}` }, { status: 500 })
    return NextResponse.json({ success: true, recipient: RECIPIENT, labels: LABELS, provider: 'resend' })
  }

  return NextResponse.json({ error: 'Email is not configured.' }, { status: 500 })
}
