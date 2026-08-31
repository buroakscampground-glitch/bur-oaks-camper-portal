import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { buildMeterLabelsPdf } from '../../../lib/meter-labels'
import { normalizeLotKey } from '../../../lib/meter-reading'

const oneTimeKey = 'send-meter-41-ff17-98bc2d4f'
const recipient = 'dlfinlee@gmail.com'
const requestedKeys = ['41', 'FF17']

function parseSender(value: string) {
  const match = value.trim().match(/^(.*?)<([^>]+)>$/)
  return match
    ? { name: match[1].trim().replace(/^"|"$/g, '') || undefined, email: match[2].trim() }
    : { email: value.trim() }
}

export async function POST(request: Request) {
  if (request.headers.get('x-one-time-key') !== oneTimeKey) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const sendgridKey = process.env.SENDGRID_API_KEY
  const fromValue = (process.env.SENDGRID_FROM || process.env.ADMIN_ALERT_FROM || process.env.INVOICE_EMAIL_FROM || '').trim()
  if (!url || !serviceKey || !sendgridKey || !fromValue) {
    return NextResponse.json({ error: 'Database or campground email is not configured.' }, { status: 500 })
  }

  const admin = createClient(url, serviceKey)
  const [{ data: lots, error: lotsError }, { data: campers, error: campersError }] = await Promise.all([
    admin.from('lots').select('lot_number,meter_number'),
    admin.from('campers').select('lot_number,active,role'),
  ])
  if (lotsError || campersError) {
    return NextResponse.json({ error: lotsError?.message || campersError?.message }, { status: 500 })
  }

  const selected = requestedKeys.map((key) =>
    (lots || []).find((lot: any) => normalizeLotKey(lot.lot_number) === key) ||
    (campers || []).find((camper: any) => camper.active !== false && normalizeLotKey(camper.lot_number) === key)
  )
  const missing = requestedKeys.filter((_, index) => !selected[index])
  if (missing.length) return NextResponse.json({ error: `Missing lot records: ${missing.join(', ')}` }, { status: 404 })

  const labels = selected.map((lot: any) => ({
    lot_number: String(lot.lot_number),
    meter_number: lot.meter_number || null,
  }))
  const pdf = await buildMeterLabelsPdf(labels)
  const attachment = Buffer.from(pdf).toString('base64')
  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${sendgridKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: recipient }], subject: 'Bur Oaks meter QR labels — Lots 41 and FF17' }],
      from: parseSender(fromValue),
      reply_to: { email: parseSender(process.env.SENDGRID_REPLY_TO || 'buroakscampground@gmail.com').email },
      content: [
        { type: 'text/plain', value: 'The printable Bur Oaks electric meter QR labels for Lots 41 and FF17 are attached. Print at actual size, cut on the borders, and protect them with weather-resistant tape or laminate.' },
        { type: 'text/html', value: '<p>The printable Bur Oaks electric meter QR labels for <strong>Lots 41 and FF17</strong> are attached.</p><p>Print at actual size, cut on the borders, and protect them with weather-resistant tape or laminate.</p>' },
      ],
      attachments: [{ content: attachment, filename: 'bur-oaks-meter-qr-41-ff17.pdf', type: 'application/pdf', disposition: 'attachment' }],
    }),
  })
  if (!response.ok) {
    return NextResponse.json({ error: await response.text().catch(() => `SendGrid error ${response.status}`) }, { status: 502 })
  }

  return NextResponse.json({
    success: true,
    recipient,
    lots: labels.map((label) => label.lot_number),
    providerMessageId: response.headers.get('x-message-id'),
  })
}
