import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { buildMeterLabelsPdf } from '../../../lib/meter-labels'
import { normalizeLotKey } from '../../../lib/meter-reading'

const oneTimeKey = 'normalize-17-labels-2c48a7de'
const recipient = 'dlfinlee@gmail.com'
const requestedKeys = ['FF15A', 'TEMP1', '17']

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
  const [{ data: campers, error: camperError }, { data: lots, error: lotError }] = await Promise.all([
    admin.from('campers').select('id,first_name,last_name,lot_number,active,role'),
    admin.from('lots').select('id,lot_number,meter_number,camper_id'),
  ])
  if (camperError || lotError) return NextResponse.json({ error: camperError?.message || lotError?.message }, { status: 500 })

  const active17 = (campers || []).filter((camper: any) =>
    camper.active !== false && String(camper.role || '').toLowerCase() !== 'admin' && normalizeLotKey(camper.lot_number) === '17'
  )
  if (active17.length !== 1) {
    return NextResponse.json({ error: `Expected one active Site 17 camper record; found ${active17.length}.` }, { status: 409 })
  }
  const camper17 = active17[0]
  const lot17Rows = (lots || []).filter((lot: any) => normalizeLotKey(lot.lot_number) === '17')
  if (lot17Rows.length !== 1) {
    return NextResponse.json({ error: `Expected one Site 17 lot record; found ${lot17Rows.length}.` }, { status: 409 })
  }

  const updates = await Promise.all([
    admin.from('campers').update({ lot_number: '17' }).eq('id', camper17.id),
    admin.from('lots').update({ lot_number: '17' }).eq('id', lot17Rows[0].id),
    admin.from('meter_reading_submissions').update({ lot_number: '17' }).eq('camper_id', camper17.id),
  ])
  const updateError = updates.find((result: any) => result.error)?.error
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  const refreshedCampers = (campers || []).map((camper: any) => camper.id === camper17.id ? { ...camper, lot_number: '17' } : camper)
  const refreshedLots = (lots || []).map((lot: any) => lot.id === lot17Rows[0].id ? { ...lot, lot_number: '17' } : lot)
  const labels = requestedKeys.map((key) => {
    const lot = refreshedLots.find((row: any) => normalizeLotKey(row.lot_number) === key)
    const camper = refreshedCampers.find((row: any) => row.active !== false && normalizeLotKey(row.lot_number) === key)
    return {
      lot_number: String(lot?.lot_number || camper?.lot_number || (key === 'TEMP1' ? 'Temp 1' : key)),
      meter_number: lot?.meter_number || null,
    }
  })

  const pdf = await buildMeterLabelsPdf(labels)
  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${sendgridKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: recipient }], subject: 'Replacement Bur Oaks meter QR labels — FF15A, Temp 1, and Lot 17' }],
      from: parseSender(fromValue),
      reply_to: { email: parseSender(process.env.SENDGRID_REPLY_TO || 'buroakscampground@gmail.com').email },
      content: [
        { type: 'text/plain', value: 'Replacement electric meter QR labels for FF15A, Temp 1, and Lot 17 are attached. Replace the old Lot 17 label so future scans use the normalized site number 17.' },
        { type: 'text/html', value: '<p>Replacement electric meter QR labels for <strong>FF15A, Temp 1, and Lot 17</strong> are attached.</p><p>Please replace the old Lot 17 label so future scans use the normalized site number <strong>17</strong>.</p>' },
      ],
      attachments: [{ content: Buffer.from(pdf).toString('base64'), filename: 'bur-oaks-replacement-qr-ff15a-temp1-17.pdf', type: 'application/pdf', disposition: 'attachment' }],
    }),
  })
  if (!response.ok) return NextResponse.json({ error: await response.text().catch(() => `SendGrid error ${response.status}`) }, { status: 502 })

  return NextResponse.json({
    success: true,
    normalizedCamper: `${camper17.first_name} ${camper17.last_name}`,
    normalizedLot: '17',
    labels: labels.map((label) => label.lot_number),
    recipient,
    providerMessageId: response.headers.get('x-message-id'),
  })
}
