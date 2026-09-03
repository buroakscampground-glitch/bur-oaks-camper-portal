import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import { maintenanceTaskForDisplay } from './maintenance-ticket-display.ts'
import { isCompletedTicketStatus } from './maintenance-status.ts'

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
  completed_at?: string | null
  completion_notes?: string | null
  work_order_printed_at?: string | null
  photo_urls?: string[] | null
  parts?: Array<{
    item_name?: string | null
    quantity?: number | string | null
    unit?: string | null
    used_by?: string | null
    notes?: string | null
  }>
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

function drawWorkOrderPage(page: PDFPage, order: MaintenanceWorkOrder, regular: PDFFont, bold: PDFFont, reportDate: string, pageNumber: number, total: number, completedCopy = false) {
  const { width, height } = page.getSize()
  const orderNumber = `WO-${safeText(order.id).slice(0, 8).toUpperCase()}`

  page.drawRectangle({ x: 0, y: height - 88, width, height: 88, color: forest })
  page.drawText('BUR OAKS CAMPGROUND', { x: 36, y: height - 31, font: bold, size: 10, color: rgb(0.92, 0.79, 0.44) })
  page.drawText(completedCopy ? 'Completed Maintenance Work Order' : 'Official Maintenance Work Order', { x: 36, y: height - 59, font: bold, size: completedCopy ? 20 : 22, color: rgb(1, 1, 1) })
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
  const descriptionLines = wrapText(maintenanceTaskForDisplay(order), regular, 10, width - 96, 5)
  descriptionLines.forEach((lineText, index) => page.drawText(lineText, { x: 48, y: 458 - index * 13, font: regular, size: 10, color: ink }))
  if (Array.isArray(order.photo_urls) && order.photo_urls.length) {
    page.drawText('Reference photos are available in the maintenance portal.', { x: 48, y: 417, font: bold, size: 7.5, color: gold })
  }

  page.drawText('WORK PERFORMED / TECHNICIAN NOTES', { x: 36, y: 382, font: bold, size: 9, color: forest })
  page.drawRectangle({ x: 36, y: 258, width: width - 72, height: 109, borderColor: line, borderWidth: 0.8 })
  if (completedCopy) {
    const noteLines = wrapText(order.completion_notes || 'Completed. No completion notes were entered.', regular, 10, width - 96, 7)
    noteLines.forEach((lineText, index) => page.drawText(lineText, { x: 48, y: 346 - index * 13, font: regular, size: 10, color: ink }))
  } else {
    drawWritingLines(page, 344, 5, 48, width - 96)
  }

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
  if (completedCopy && order.parts?.length) {
    order.parts.slice(0, 3).forEach((part, index) => {
      const y = 185 - index * 21
      const quantity = [safeText(part.quantity), safeText(part.unit)].filter(Boolean).join(' ')
      const notes = [safeText(part.used_by), safeText(part.notes)].filter(Boolean).join(' - ')
      page.drawText(safeText(quantity) || '-', { x: 45, y, font: regular, size: 7.5, color: ink })
      page.drawText(wrapText(part.item_name || '-', regular, 7.5, 232, 1)[0], { x: 108, y, font: regular, size: 7.5, color: ink })
      page.drawText(wrapText(notes || '-', regular, 7.5, 218, 1)[0], { x: 354, y, font: regular, size: 7.5, color: ink })
    })
  }

  page.drawText('JOB RESULT', { x: 36, y: 112, font: bold, size: 8, color: gold })
  page.drawText(completedCopy ? '[X] Completed     [ ] Waiting for parts     [ ] Follow-up needed' : '[ ] Completed     [ ] Waiting for parts     [ ] Follow-up needed', { x: 36, y: 94, font: regular, size: 9, color: ink })
  page.drawText('Technician Signature', { x: 36, y: 69, font: bold, size: 7.5, color: gray })
  page.drawLine({ start: { x: 36, y: 58 }, end: { x: 265, y: 58 }, thickness: 0.7, color: gray })
  page.drawText(completedCopy ? `Completed ${displayDate(order.completed_at)}` : 'Date', { x: 288, y: 69, font: bold, size: 7.5, color: gray })
  page.drawLine({ start: { x: 288, y: 58 }, end: { x: 390, y: 58 }, thickness: 0.7, color: gray })
  page.drawText('Office Review', { x: 414, y: 69, font: bold, size: 7.5, color: gray })
  page.drawLine({ start: { x: 414, y: 58 }, end: { x: 576, y: 58 }, thickness: 0.7, color: gray })

  page.drawText('10303 Oaks Rd. - Alhambra, IL 62001 - 618-488-7927', { x: 36, y: 24, font: regular, size: 7.5, color: gray })
  page.drawText(completedCopy ? `Office file copy  -  Page ${pageNumber} of ${total}` : `Return completed work order to the office.  Page ${pageNumber} of ${total}`, { x: completedCopy ? 418 : 326, y: 24, font: bold, size: 7.5, color: forest })
}

export async function buildMaintenanceWorkOrdersPdf(orders: MaintenanceWorkOrder[], reportDate: string) {
  const pdf = await PDFDocument.create()
  pdf.setTitle(`Bur Oaks New Maintenance Work Orders - ${reportDate}`)
  pdf.setAuthor('Bur Oaks Campground')
  pdf.setSubject('New maintenance work orders awaiting their first print')
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)

  orders.forEach((order, index) => {
    const page = pdf.addPage([612, 792])
    drawWorkOrderPage(page, order, regular, bold, reportDate, index + 1, orders.length)
  })

  return pdf.save()
}

export async function buildCompletedMaintenanceWorkOrderPdf(order: MaintenanceWorkOrder, reportDate: string) {
  const pdf = await PDFDocument.create()
  const orderNumber = safeText(order.id).slice(0, 8).toUpperCase()
  pdf.setTitle(`Bur Oaks Completed Work Order WO-${orderNumber}`)
  pdf.setAuthor('Bur Oaks Campground')
  pdf.setSubject('Completed maintenance work order office file copy')
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const page = pdf.addPage([612, 792])
  drawWorkOrderPage(page, order, regular, bold, reportDate, 1, 1, true)
  return pdf.save()
}

export async function loadNewMaintenanceWorkOrders(client: any) {
  const { data, error } = await client
    .from('maintenance_tickets')
    .select('id,title,description,category,priority,status,assigned_to,lot_number,reported_by,created_at,approved_at,work_order_printed_at,photo_urls')
    .eq('admin_approved', true)
    .neq('status', 'Completed')
    .is('work_order_printed_at', null)
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
  const filename = `bur-oaks-new-work-orders-${reportDate}.pdf`
  const subject = `Bur Oaks new maintenance work orders - ${reportDate}`
  const text = `Bur Oaks maintenance packet for ${reportDate}. ${count} new approved work order${count === 1 ? '' : 's'} ready for its first print. Each work order is on its own printable page.`
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

async function sendCompletedWorkOrderEmail(to: string, pdfBytes: Uint8Array, order: MaintenanceWorkOrder): Promise<DeliveryResult> {
  const from = emailFrom()
  const orderNumber = safeText(order.id).slice(0, 8).toUpperCase()
  const filename = `bur-oaks-completed-work-order-WO-${orderNumber}.pdf`
  const subject = `PRINT: Bur Oaks completed work order WO-${orderNumber}`
  const text = `Print the attached completed Bur Oaks maintenance work order for the office files. Work order WO-${orderNumber}, lot ${safeText(order.lot_number) || 'N/A'}.`
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
        content: [{ type: 'text/plain', value: text }],
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
        attachments: [{ filename, content: attachment }],
      }),
    })
    const result = await response.json().catch(() => ({}))
    if (!response.ok) return { sent: false, provider: 'resend', error: result.message || `Resend error ${response.status}` }
    return { sent: true, provider: 'resend', providerMessageId: result.id || null }
  }

  return { sent: false, provider: null, error: 'SendGrid or Resend is not configured.' }
}

function centralDate(value = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(value)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value || ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

export async function printCompletedMaintenanceWorkOrder(client: any, ticketId: string) {
  const { data: order, error: orderError } = await client
    .from('maintenance_tickets')
    .select('id,title,description,category,priority,status,assigned_to,lot_number,reported_by,created_at,approved_at,completed_at,completion_notes,work_order_printed_at,photo_urls')
    .eq('id', ticketId)
    .maybeSingle()

  if (orderError) throw new Error(orderError.message)
  if (!order) throw new Error('The completed work order could not be found.')
  if (!isCompletedTicketStatus(order.status)) throw new Error('The work order must be completed before it can print.')

  const partsResult = await client
    .from('maintenance_ticket_parts')
    .select('item_name,quantity,unit,used_by,notes')
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: true })
  if (partsResult.error) throw new Error(partsResult.error.message)
  order.parts = partsResult.data || []

  const reportKey = `completed-maintenance-${ticketId}`
  const reportDate = '2000-01-01'
  let { data: reservation, error: reserveError } = await client
    .from('scheduled_reports')
    .insert({ report_key: reportKey, report_date: reportDate, status: 'running', item_count: 1, office_email_status: 'skipped' })
    .select('id,status')
    .single()

  if (reserveError?.code === '23505') {
    const existing = await client
      .from('scheduled_reports')
      .select('id,status,started_at')
      .eq('report_key', reportKey)
      .eq('report_date', reportDate)
      .maybeSingle()

    if (existing.error) throw new Error(existing.error.message)
    const runningRecently = existing.data?.status === 'running' && Date.now() - new Date(existing.data.started_at || 0).getTime() < 5 * 60 * 1000
    if (existing.data?.status === 'sent' || runningRecently) {
      return { order, skipped: true, printer: null, reason: existing.data.status === 'sent' ? 'This completed work order already printed.' : 'This completed work order is already being sent to the printer.' }
    }

    reservation = existing.data
    reserveError = null
    if (reservation?.id) {
      const retry = await client.from('scheduled_reports').update({
        status: 'running', error_message: null, started_at: new Date().toISOString(), completed_at: null, updated_at: new Date().toISOString(),
      }).eq('id', reservation.id)
      if (retry.error) throw new Error(retry.error.message)
    }
  }

  if (reserveError || !reservation) throw new Error(reserveError?.message || 'Unable to reserve the completed work-order print.')

  try {
    const completedDate = centralDate(order.completed_at ? new Date(order.completed_at) : new Date())
    const pdfBytes = await buildCompletedMaintenanceWorkOrderPdf(order, completedDate)
    const printerEmail = process.env.MAINTENANCE_PRINTER_EMAIL || process.env.PUMP_OUT_PRINTER_EMAIL || 'una63106xie2gt@print.epsonconnect.com'
    const printer = await sendCompletedWorkOrderEmail(printerEmail, pdfBytes, order)

    await client.from('scheduled_reports').update({
      status: printer.sent ? 'sent' : 'failed',
      printer_email_status: printer.sent ? 'sent' : 'failed',
      error_message: printer.error || null,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', reservation.id)

    if (!printer.sent) throw new Error(printer.error || 'The completed work order did not reach the Epson printer.')
    return { order, skipped: false, printer, printerEmail }
  } catch (error: any) {
    await client.from('scheduled_reports').update({
      status: 'failed', error_message: String(error?.message || error).slice(0, 2000),
      completed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq('id', reservation.id)
    throw error
  }
}

export async function sendMaintenanceWorkOrderReport(client: any, reportDate: string) {
  const orders = await loadNewMaintenanceWorkOrders(client)
  if (!orders.length) return { orders, pdfBytes: null, office: null, printer: null, skipped: true }

  const pdfBytes = await buildMaintenanceWorkOrdersPdf(orders, reportDate)
  const officeEmail = process.env.MAINTENANCE_REPORT_EMAIL || process.env.PUMP_OUT_REPORT_EMAIL || 'buroakscampground@gmail.com'
  const printerEmail = process.env.MAINTENANCE_PRINTER_EMAIL || process.env.PUMP_OUT_PRINTER_EMAIL || 'una63106xie2gt@print.epsonconnect.com'
  const [office, printer] = await Promise.all([
    sendWorkOrderEmail(officeEmail, pdfBytes, reportDate, orders.length),
    sendWorkOrderEmail(printerEmail, pdfBytes, reportDate, orders.length),
  ])

  if (printer.sent) {
    const { error } = await client
      .from('maintenance_tickets')
      .update({ work_order_printed_at: new Date().toISOString() })
      .in('id', orders.map((order) => order.id))

    if (error) throw new Error(`The printer received the packet, but the work orders could not be marked printed: ${error.message}`)
  }

  return { orders, pdfBytes, office, printer, skipped: false, officeEmail, printerEmail }
}
