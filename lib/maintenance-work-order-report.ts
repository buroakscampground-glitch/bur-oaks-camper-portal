import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'

export type MaintenanceWorkOrder = {
  id: string
  title?: string | null
  description?: string | null
  category?: string | null
  priority?: string | null
  status?: string | null
  assigned_to?: string | null
  lot_number?: string | null
  reported_by?: string | null
  created_at?: string | null
  approved_at?: string | null
  photo_urls?: string[] | null
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
const paper = rgb(0.985, 0.985, 0.97)

function safeText(value: unknown) {
  return String(value || '')
    .replace(/[–—]/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function displayDate(value?: string | null) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return safeText(value)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fullReportDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })
}

function wrapText(text: unknown, font: PDFFont, size: number, maxWidth: number, maxLines: number) {
  const words = safeText(text).split(/\s+/).filter(Boolean)
  if (!words.length) return ['-']
  const lines: string[] = []
  let current = ''

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate
      continue
    }
    if (current) lines.push(current)
    current = word
    if (lines.length === maxLines) break
  }

  if (current && lines.length < maxLines) lines.push(current)
  if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) {
    let last = lines[maxLines - 1]
    while (last && font.widthOfTextAtSize(`${last}...`, size) > maxWidth) last = last.slice(0, -1)
    lines[maxLines - 1] = `${last}...`
  }
  return lines
}

function drawLabelValue(page: PDFPage, bold: PDFFont, regular: PDFFont, x: number, y: number, label: string, value: unknown, width: number) {
  page.drawText(label.toUpperCase(), { x, y, font: bold, size: 7.5, color: gold })
  const text = wrapText(value || '-', regular, 10, width, 2)
  text.forEach((lineText, index) => page.drawText(lineText, { x, y: y - 16 - index * 11, font: regular, size: 10, color: ink }))
}

function drawWritingLines(page: PDFPage, startY: number, count: number, x = 44, width = 524) {
  for (let index = 0; index < count; index += 1) {
    const y = startY - index * 20
    page.drawLine({ start: { x, y }, end: { x: x + width, y }, thickness: 0.6, color: line })
  }
}

function drawWorkOrderPage(page: PDFPage, order: MaintenanceWorkOrder, regular: PDFFont, bold: PDFFont, reportDate: string, pageNumber: number, total: number) {
  const { width, height } = page.getSize()
  const orderNumber = `WO-${safeText(order.id).slice(0, 8).toUpperCase()}`

  page.drawRectangle({ x: 0, y: height - 88, width, height: 88, color: forest })
  page.drawText('BUR OAKS CAMPGROUND', { x: 36, y: height - 31, font: bold, size: 10, color: rgb(0.92, 0.79, 0.44) })
  page.drawText('Official Maintenance Work Order', { x: 36, y: height - 59, font: bold, size: 22, color: rgb(1, 1, 1) })
  page.drawText(orderNumber, { x: width - 165, y: height - 36, font: bold, size: 14, color: rgb(1, 1, 1) })
  page.drawText(fullReportDate(reportDate), { x: width - 220, y: height - 58, font: regular, size: 9, color: rgb(0.89, 0.94, 0.9) })

  const priority = safeText(order.priority) || 'Normal'
  const priorityColor = priority.toLowerCase() === 'emergency' ? rgb(0.67, 0.18, 0.13) : priority.toLowerCase() === 'high' ? rgb(0.72, 0.38, 0.12) : forest
  const priorityWidth = Math.max(88, bold.widthOfTextAtSize(`${priority} PRIORITY`, 8) + 24)
  page.drawRectangle({ x: width - 36 - priorityWidth, y: 648, width: priorityWidth, height: 25, color: priorityColor })
  page.drawText(`${priority.toUpperCase()} PRIORITY`, { x: width - 24 - priorityWidth, y: 657, font: bold, size: 8, color: rgb(1, 1, 1) })

  page.drawText('WORK REQUESTED', { x: 36, y: 665, font: bold, size: 8, color: gold })
  const titleLines = wrapText(order.title || 'Untitled work order', bold, 19, 390, 2)
  titleLines.forEach((lineText, index) => page.drawText(lineText, { x: 36, y: 638 - index * 22, font: bold, size: 19, color: ink }))

  page.drawRectangle({ x: 36, y: 518, width: width - 72, height: 82, color: forestSoft, borderColor: line, borderWidth: 0.7 })
  drawLabelValue(page, bold, regular, 50, 578, 'Lot / Site', safeText(order.lot_number) || 'N/A', 70)
  drawLabelValue(page, bold, regular, 138, 578, 'Category', safeText(order.category) || 'General', 90)
  drawLabelValue(page, bold, regular, 246, 578, 'Status', safeText(order.status) || 'Open', 90)
  drawLabelValue(page, bold, regular, 354, 578, 'Assigned To', safeText(order.assigned_to) || 'Open', 105)
  drawLabelValue(page, bold, regular, 477, 578, 'Reported', displayDate(order.created_at), 90)

  page.drawText('PROBLEM / REQUESTED WORK', { x: 36, y: 490, font: bold, size: 9, color: forest })
  page.drawRectangle({ x: 36, y: 408, width: width - 72, height: 68, color: paper, borderColor: line, borderWidth: 0.8 })
  const descriptionLines = wrapText(order.description || 'No description was provided.', regular, 10, width - 96, 5)
  descriptionLines.forEach((lineText, index) => page.drawText(lineText, { x: 48, y: 458 - index * 13, font: regular, size: 10, color: ink }))
  if (Array.isArray(order.photo_urls) && order.photo_urls.length) {
    page.drawText('Reference photos are available in the maintenance portal.', { x: 48, y: 417, font: bold, size: 7.5, color: gold })
  }

  page.drawText('WORK PERFORMED / TECHNICIAN NOTES', { x: 36, y: 382, font: bold, size: 9, color: forest })
  page.drawRectangle({ x: 36, y: 258, width: width - 72, height: 109, borderColor: line, borderWidth: 0.8 })
  drawWritingLines(page, 344, 5, 48, width - 96)

  page.drawText('MATERIALS / PARTS USED', { x: 36, y: 235, font: bold, size: 9, color: forest })
  const tableX = 36
  const tableY = 137
  const tableWidth = width - 72
  page.drawRectangle({ x: tableX, y: tableY, width: tableWidth, height: 83, borderColor: line, borderWidth: 0.8 })
  page.drawRectangle({ x: tableX, y: 198, width: tableWidth, height: 22, color: forestSoft })
  ;[['QTY.', 45], ['PART OR MATERIAL', 100], ['SOURCE / NOTES', 346]].forEach(([label, x]) => {
    page.drawText(String(label), { x: Number(x), y: 206, font: bold, size: 7.5, color: forest })
  })
  ;[100, 346].forEach((x) => page.drawLine({ start: { x, y: tableY }, end: { x, y: 220 }, thickness: 0.7, color: line }))
  ;[178, 157].forEach((y) => page.drawLine({ start: { x: tableX, y }, end: { x: tableX + tableWidth, y }, thickness: 0.6, color: line }))

  page.drawText('JOB RESULT', { x: 36, y: 112, font: bold, size: 8, color: gold })
  page.drawText('[ ] Completed     [ ] Waiting for parts     [ ] Follow-up needed', { x: 36, y: 94, font: regular, size: 9, color: ink })
  page.drawText('Technician Signature', { x: 36, y: 69, font: bold, size: 7.5, color: gray })
  page.drawLine({ start: { x: 36, y: 58 }, end: { x: 265, y: 58 }, thickness: 0.7, color: gray })
  page.drawText('Date', { x: 288, y: 69, font: bold, size: 7.5, color: gray })
  page.drawLine({ start: { x: 288, y: 58 }, end: { x: 390, y: 58 }, thickness: 0.7, color: gray })
  page.drawText('Office Review', { x: 414, y: 69, font: bold, size: 7.5, color: gray })
  page.drawLine({ start: { x: 414, y: 58 }, end: { x: 576, y: 58 }, thickness: 0.7, color: gray })

  page.drawText('10303 Oaks Rd. - Alhambra, IL 62001 - 618-488-7927', { x: 36, y: 24, font: regular, size: 7.5, color: gray })
  page.drawText(`Return completed work order to the office.  Page ${pageNumber} of ${total}`, { x: 326, y: 24, font: bold, size: 7.5, color: forest })
}

export async function buildMaintenanceWorkOrdersPdf(orders: MaintenanceWorkOrder[], reportDate: string) {
  const pdf = await PDFDocument.create()
  pdf.setTitle(`Bur Oaks Active Maintenance Work Orders - ${reportDate}`)
  pdf.setAuthor('Bur Oaks Campground')
  pdf.setSubject('Daily active maintenance work-order packet')
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)

  orders.forEach((order, index) => {
    const page = pdf.addPage([612, 792])
    drawWorkOrderPage(page, order, regular, bold, reportDate, index + 1, orders.length)
  })

  return pdf.save()
}

export async function loadActiveMaintenanceWorkOrders(client: any) {
  const { data, error } = await client
    .from('maintenance_tickets')
    .select('id,title,description,category,priority,status,assigned_to,lot_number,reported_by,created_at,approved_at,photo_urls')
    .eq('admin_approved', true)
    .neq('status', 'Completed')
    .order('priority', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) throw new Error(error.message)
  return (data || []) as MaintenanceWorkOrder[]
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

async function sendWorkOrderEmail(to: string, pdfBytes: Uint8Array, reportDate: string, count: number): Promise<DeliveryResult> {
  const from = emailFrom()
  const filename = `bur-oaks-active-work-orders-${reportDate}.pdf`
  const subject = `Bur Oaks active maintenance work orders - ${reportDate}`
  const text = `Bur Oaks daily maintenance packet for ${reportDate}. ${count} active approved work order${count === 1 ? '' : 's'}. Each work order is on its own printable page.`
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

export async function sendMaintenanceWorkOrderReport(client: any, reportDate: string) {
  const orders = await loadActiveMaintenanceWorkOrders(client)
  if (!orders.length) return { orders, pdfBytes: null, office: null, printer: null, skipped: true }

  const pdfBytes = await buildMaintenanceWorkOrdersPdf(orders, reportDate)
  const officeEmail = process.env.MAINTENANCE_REPORT_EMAIL || process.env.PUMP_OUT_REPORT_EMAIL || 'buroakscampground@gmail.com'
  const printerEmail = process.env.MAINTENANCE_PRINTER_EMAIL || process.env.PUMP_OUT_PRINTER_EMAIL || 'una63106xie2gt@print.epsonconnect.com'
  const [office, printer] = await Promise.all([
    sendWorkOrderEmail(officeEmail, pdfBytes, reportDate, orders.length),
    sendWorkOrderEmail(printerEmail, pdfBytes, reportDate, orders.length),
  ])

  return { orders, pdfBytes, office, printer, skipped: false, officeEmail, printerEmail }
}
