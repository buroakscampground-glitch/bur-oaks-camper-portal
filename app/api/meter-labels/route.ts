import { NextResponse } from 'next/server'
import { isOperationalCamper } from '../../../lib/camper-records'
import { buildMeterLabelsPdf } from '../../../lib/meter-labels'
import { normalizeLotKey } from '../../../lib/meter-reading'
import { getAuthenticatedContext } from '../../../lib/server-auth'

export const runtime = 'nodejs'

function parseSender(value: string) {
  const match = value.trim().match(/^(.*?)<([^>]+)>$/)
  return match
    ? { name: match[1].trim().replace(/^"|"$/g, '') || undefined, email: match[2].trim() }
    : { email: value.trim() }
}

async function loadSites(context: any) {
  const [{ data: lots }, { data: campers }] = await Promise.all([
    context.admin.from('lots').select('lot_number,meter_number'),
    context.admin.from('campers').select('lot_number,role,active'),
  ])
  const meterByLot = new Map<string, string | null>()
  const sites = new Map<string, { lot_number: string; meter_number: string | null }>()
  for (const lot of lots || []) {
    const key = normalizeLotKey(lot.lot_number)
    if (!key || key === 'STAFF' || !isOperationalCamper({ lot_number: lot.lot_number, role: 'camper' })) continue
    meterByLot.set(key, lot.meter_number || null)
    sites.set(key, { lot_number: String(lot.lot_number), meter_number: lot.meter_number || null })
  }
  for (const camper of campers || []) {
    const key = normalizeLotKey(camper.lot_number)
    if (!key || camper.active === false || !isOperationalCamper(camper)) continue
    if (!sites.has(key)) sites.set(key, { lot_number: String(camper.lot_number), meter_number: meterByLot.get(key) || null })
  }
  return [...sites.values()].sort((a, b) => a.lot_number.localeCompare(b.lot_number, undefined, { numeric: true }))
}

function selectRequestedLot(
  sites: { lot_number: string; meter_number: string | null }[],
  requestedLot: unknown,
) {
  const key = normalizeLotKey(requestedLot)
  if (!key || key === 'STAFF' || !isOperationalCamper({ lot_number: key, role: 'camper' })) return null
  return sites.find((site) => normalizeLotKey(site.lot_number) === key) || { lot_number: key, meter_number: null }
}

async function sendPdf(to: string, pdfBytes: Uint8Array, count: number) {
  const from = (process.env.SENDGRID_FROM || process.env.ADMIN_ALERT_FROM || process.env.INVOICE_EMAIL_FROM || '').trim()
  if (!from) return { sent: false, error: 'The campground email sender is not configured.' }
  const attachment = Buffer.from(pdfBytes).toString('base64')
  const subject = 'Bur Oaks electric meter QR labels'
  const text = `${count} printable Bur Oaks meter labels are attached. Print at actual size, cut on the borders, and protect each label with weather-resistant tape or laminate.`

  if (process.env.SENDGRID_API_KEY) {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }], subject }],
        from: parseSender(from),
        reply_to: { email: parseSender(process.env.SENDGRID_REPLY_TO || 'buroakscampground@gmail.com').email },
        content: [
          { type: 'text/plain', value: text },
          { type: 'text/html', value: `<p>${text}</p><p><strong>The cut-ready PDF is attached.</strong></p>` },
        ],
        attachments: [{ content: attachment, filename: 'bur-oaks-meter-qr-labels.pdf', type: 'application/pdf', disposition: 'attachment' }],
      }),
    })
    if (!response.ok) return { sent: false, error: await response.text().catch(() => `SendGrid error ${response.status}`) }
    return { sent: true, provider: 'sendgrid' }
  }

  if (process.env.RESEND_API_KEY) {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [to],
        reply_to: process.env.SENDGRID_REPLY_TO || 'buroakscampground@gmail.com',
        subject,
        text,
        html: `<p>${text}</p><p><strong>The cut-ready PDF is attached.</strong></p>`,
        attachments: [{ filename: 'bur-oaks-meter-qr-labels.pdf', content: attachment }],
      }),
    })
    const result = await response.json().catch(() => ({}))
    if (!response.ok) return { sent: false, error: result.message || `Resend error ${response.status}` }
    return { sent: true, provider: 'resend' }
  }

  return { sent: false, error: 'SendGrid or Resend is not configured.' }
}

async function authorized(request: Request) {
  const context = await getAuthenticatedContext(request)
  return context && String(context.camper.role || '').toLowerCase() === 'admin' ? context : null
}

export async function GET(request: Request) {
  const context = await authorized(request)
  if (!context) return NextResponse.json({ error: 'Admin access is required.' }, { status: 403 })
  const sites = await loadSites(context)
  const requestedLot = new URL(request.url).searchParams.get('lot')
  const singleSite = requestedLot ? selectRequestedLot(sites, requestedLot) : null
  if (requestedLot && !singleSite) return NextResponse.json({ error: 'Enter a valid lot number.' }, { status: 400 })
  const labelSites = singleSite ? [singleSite] : sites
  const pdf = await buildMeterLabelsPdf(labelSites)
  const filename = singleSite ? `bur-oaks-meter-qr-${normalizeLotKey(singleSite.lot_number)}.pdf` : 'bur-oaks-meter-qr-labels.pdf'
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}

export async function POST(request: Request) {
  const context = await authorized(request)
  if (!context) return NextResponse.json({ error: 'Admin access is required.' }, { status: 403 })
  const body = await request.json().catch(() => ({}))
  const recipient = String(body.email || context.user.email || '').trim().toLowerCase()
  if (!/^\S+@\S+\.\S+$/.test(recipient)) return NextResponse.json({ error: 'Enter a valid delivery email.' }, { status: 400 })
  const sites = await loadSites(context)
  const singleSite = body.lot ? selectRequestedLot(sites, body.lot) : null
  if (body.lot && !singleSite) return NextResponse.json({ error: 'Enter a valid lot number.' }, { status: 400 })
  const labelSites = singleSite ? [singleSite] : sites
  const pdf = await buildMeterLabelsPdf(labelSites)
  const delivery = await sendPdf(recipient, pdf, labelSites.length)
  if (!delivery.sent) return NextResponse.json({ error: delivery.error || 'The labels could not be emailed.' }, { status: 500 })
  return NextResponse.json({ success: true, count: labelSites.length, recipient, provider: delivery.provider })
}
