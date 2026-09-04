import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import { isSystemPortalAccount } from './camper-records'
import { uniquePrinterEmails } from './report-printer-emails'

type PumpOutRequest = {
  id: string
  lot_number?: string | null
  camper_name?: string | null
  status?: string | null
  charge_amount?: number | string | null
  notes?: string | null
  requested_at?: string | null
}

type DeliveryResult = {
  sent: boolean
  provider: 'sendgrid' | 'resend' | null
  providerMessageId?: string | null
  error?: string
}

const forest = rgb(0.102, 0.286, 0.176)
const forestSoft = rgb(0.925, 0.952, 0.919)
const gold = rgb(0.72, 0.57, 0.25)
const ink = rgb(0.12, 0.19, 0.14)
const gray = rgb(0.38, 0.43, 0.39)
const line = rgb(0.81, 0.83, 0.79)

function safeText(value: unknown) {
  return String(value || '')
    .replace(/[–—]/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^\x20-\x7E]/g, '')
    .trim()
}

function requestDateCompare(a: PumpOutRequest, b: PumpOutRequest) {
  const aTime = a.requested_at ? new Date(a.requested_at).getTime() : Number.MAX_SAFE_INTEGER
  const bTime = b.requested_at ? new Date(b.requested_at).getTime() : Number.MAX_SAFE_INTEGER
  const safeATime = Number.isNaN(aTime) ? Number.MAX_SAFE_INTEGER : aTime
  const safeBTime = Number.isNaN(bTime) ? Number.MAX_SAFE_INTEGER : bTime
  if (safeATime !== safeBTime) return safeATime - safeBTime

  return safeText(a.lot_number).localeCompare(safeText(b.lot_number), undefined, {
    numeric: true,
    sensitivity: 'base',
  })
}

function prettyDate(value?: string | null) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return safeText(value)
  return date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
}

function fullReportDate(value: string) {
  const date = new Date(`${value}T12:00:00`)
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number, maxLines = 3) {
  const words = safeText(text).split(/\s+/).filter(Boolean)
  if (!words.length) return ['-']
  const lines: string[] = []
  let lineText = ''

  for (const word of words) {
    const candidate = lineText ? `${lineText} ${word}` : word
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      lineText = candidate
      continue
    }

    if (lineText) lines.push(lineText)
    lineText = word
    if (lines.length === maxLines) break
  }

  if (lineText && lines.length < maxLines) lines.push(lineText)
  if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) {
    let last = lines[maxLines - 1]
    while (last && font.widthOfTextAtSize(`${last}...`, size) > maxWidth) last = last.slice(0, -1)
    lines[maxLines - 1] = `${last}...`
  }

  return lines
}

function drawPageHeader(page: PDFPage, bold: PDFFont, regular: PDFFont, reportDate: string, count: number) {
  const { width, height } = page.getSize()
  page.drawRectangle({ x: 0, y: height - 92, width, height: 92, color: forest })
  page.drawText('BUR OAKS CAMPGROUND', { x: 36, y: height - 34, font: bold, size: 10, color: rgb(0.9, 0.79, 0.46) })
  page.drawText('Daily Pump-Out Route', { x: 36, y: height - 64, font: bold, size: 24, color: rgb(1, 1, 1) })
  page.drawText(fullReportDate(reportDate), { x: width - 255, y: height - 40, font: regular, size: 11, color: rgb(0.9, 0.94, 0.9) })
  page.drawText(`${count} site${count === 1 ? '' : 's'} needing pump-out`, { x: width - 255, y: height - 61, font: bold, size: 11, color: rgb(1, 1, 1) })

  page.drawRectangle({ x: 36, y: height - 130, width: width - 72, height: 25, color: forestSoft })
  const headers = [
    ['DONE', 41], ['LOT', 72], ['CAMPER', 125], ['STATUS', 278],
    ['FEE', 370], ['REQUESTED', 425], ['NOTES', 526],
  ] as const
  headers.forEach(([label, x]) => page.drawText(label, { x, y: height - 121, font: bold, size: 8, color: forest }))
  return height - 136
}

export async function buildPumpOutListPdf(requests: PumpOutRequest[], reportDate: string) {
  const pdf = await PDFDocument.create()
  pdf.setTitle(`Bur Oaks Pump-Out Route - ${reportDate}`)
  pdf.setAuthor('Bur Oaks Campground')
  pdf.setSubject('Daily sewer pump-out work list')

  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const sorted = [...requests].sort(requestDateCompare)
  let page = pdf.addPage([792, 612])
  let y = drawPageHeader(page, bold, regular, reportDate, sorted.length)

  if (!sorted.length) {
    page.drawRectangle({ x: 36, y: 360, width: 720, height: 90, borderColor: line, borderWidth: 1, color: rgb(0.98, 0.985, 0.975) })
    page.drawText('No active pump-out requests today.', { x: 205, y: 408, font: bold, size: 19, color: forest })
    page.drawText('The queue is clear. Keep this sheet as the daily check record.', { x: 200, y: 384, font: regular, size: 11, color: gray })
  }

  for (const request of sorted) {
    const noteLines = wrapText(request.notes || 'No notes.', regular, 8.5, 225, 3)
    const rowHeight = Math.max(42, 19 + noteLines.length * 11)

    if (y - rowHeight < 42) {
      page = pdf.addPage([792, 612])
      y = drawPageHeader(page, bold, regular, reportDate, sorted.length)
    }

    const rowBottom = y - rowHeight
    page.drawLine({ start: { x: 36, y: rowBottom }, end: { x: 756, y: rowBottom }, thickness: 0.7, color: line })
    page.drawRectangle({ x: 43, y: y - 27, width: 13, height: 13, borderColor: forest, borderWidth: 1.2 })
    page.drawText(safeText(request.lot_number) || 'N/A', { x: 72, y: y - 22, font: bold, size: 11, color: ink })
    page.drawText(safeText(request.camper_name) || 'Camper', { x: 125, y: y - 22, font: bold, size: 10, color: ink, maxWidth: 145 })
    page.drawText('Needs pumped', { x: 278, y: y - 22, font: regular, size: 9, color: rgb(0.65, 0.2, 0.15) })
    page.drawText(`$${Number(request.charge_amount || 10).toFixed(2)}`, { x: 370, y: y - 22, font: bold, size: 10, color: gold })
    page.drawText(prettyDate(request.requested_at), { x: 425, y: y - 22, font: regular, size: 9, color: gray })
    noteLines.forEach((lineText, index) => page.drawText(lineText, { x: 526, y: y - 18 - index * 11, font: regular, size: 8.5, color: gray }))
    y = rowBottom
  }

  const pages = pdf.getPages()
  pages.forEach((current, index) => {
    current.drawText('Bur Oaks Campground - Maintenance Copy', { x: 36, y: 20, font: regular, size: 8, color: gray })
    current.drawText(`Page ${index + 1} of ${pages.length}`, { x: 704, y: 20, font: regular, size: 8, color: gray })
  })

  return pdf.save()
}

function parseSender(value: string) {
  const match = value.trim().match(/^(.*?)<([^>]+)>$/)
  return match
    ? { name: match[1].trim().replace(/^"|"$/g, '') || undefined, email: match[2].trim() }
    : { email: value.trim() }
}

function emailFrom() {
  return (process.env.SENDGRID_FROM || process.env.ADMIN_ALERT_FROM || process.env.INVOICE_EMAIL_FROM || '').trim()
}

async function sendReportEmail(to: string, pdfBytes: Uint8Array, reportDate: string, itemCount: number): Promise<DeliveryResult> {
  const from = emailFrom()
  const filename = `bur-oaks-pump-out-list-${reportDate}.pdf`
  const subject = `Bur Oaks daily pump-out list - ${reportDate}`
  const text = `Bur Oaks daily pump-out list for ${reportDate}. ${itemCount} site${itemCount === 1 ? '' : 's'} currently need${itemCount === 1 ? 's' : ''} pump-out service. The printable PDF is attached.`
  const attachment = Buffer.from(pdfBytes).toString('base64')

  if (!from) return { sent: false, provider: null, error: 'The campground email sender is not configured.' }

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
          { type: 'text/html', value: `<p>${text}</p><p><strong>The printable PDF is attached.</strong></p>` },
        ],
        attachments: [{ content: attachment, filename, type: 'application/pdf', disposition: 'attachment' }],
      }),
    })
    if (!response.ok) return { sent: false, provider: 'sendgrid', error: await response.text().catch(() => `SendGrid error ${response.status}`) }
    return { sent: true, provider: 'sendgrid', providerMessageId: response.headers.get('x-message-id') }
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
        html: `<p>${text}</p><p><strong>The printable PDF is attached.</strong></p>`,
        attachments: [{ filename, content: attachment }],
      }),
    })
    const result = await response.json().catch(() => ({}))
    if (!response.ok) return { sent: false, provider: 'resend', error: result.message || `Resend error ${response.status}` }
    return { sent: true, provider: 'resend', providerMessageId: result.id || null }
  }

  return { sent: false, provider: null, error: 'SendGrid or Resend is not configured.' }
}

export async function sendPumpOutReport(
  client: any,
  reportDate: string,
  options: { sendOffice?: boolean; sendPrinter?: boolean } = {},
) {
  const { data, error } = await client
    .from('sewer_pump_out_requests')
    .select('id,lot_number,camper_name,status,charge_amount,notes,requested_at,billed_at')
    .eq('status', 'requested')
    .is('billed_at', null)
    .order('requested_at', { ascending: true })

  if (error) throw new Error(error.message)

  // Test portal lots are useful for validating the camper view, but must never
  // appear on the office or Epson pump-out list.
  const requests = ((data || []) as PumpOutRequest[]).filter(
    (request) => !isSystemPortalAccount(request)
  )
  const pdfBytes = await buildPumpOutListPdf(requests, reportDate)
  const officeEmail = process.env.PUMP_OUT_REPORT_EMAIL || 'buroakscampground@gmail.com'
  const printerEmail = process.env.PUMP_OUT_PRINTER_EMAIL || 'una63106xie2gt@print.epsonconnect.com'
  const printerEmails = uniquePrinterEmails([
    printerEmail,
    process.env.PUMP_OUT_SECOND_PRINTER_EMAIL,
    process.env.PUMP_OUT_ADDITIONAL_PRINTER_EMAILS,
  ])

  // Epson Email Print should receive its own message, not a CC, so it can process the attachment reliably.
  const sendOffice = options.sendOffice !== false
  const sendPrinter = options.sendPrinter !== false
  const [office, printers] = await Promise.all([
    sendOffice ? sendReportEmail(officeEmail, pdfBytes, reportDate, requests.length) : Promise.resolve({ sent: true, provider: null } as DeliveryResult),
    sendPrinter ? Promise.all(printerEmails.map(async (email) => ({
      email,
      delivery: await sendReportEmail(email, pdfBytes, reportDate, requests.length),
    }))) : Promise.resolve([]),
  ])

  const failedPrinters = printers.filter((item) => !item.delivery.sent)
  const printer: DeliveryResult = {
    sent: !sendPrinter || (printers.length > 0 && failedPrinters.length === 0),
    provider: printers.every((item) => item.delivery.provider === 'sendgrid')
      ? 'sendgrid'
      : printers.every((item) => item.delivery.provider === 'resend')
        ? 'resend'
        : null,
    providerMessageId: printers.map((item) => item.delivery.providerMessageId).filter(Boolean).join(',') || null,
    error: failedPrinters.map((item) => `${item.email}: ${item.delivery.error || 'delivery failed'}`).join(' | ') || undefined,
  }

  return { requests, pdfBytes, office, printer, printers, officeEmail, printerEmail, printerEmails, sentOffice: sendOffice, sentPrinter: sendPrinter }
}
