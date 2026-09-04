import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import { uniquePrinterEmails } from './report-printer-emails.ts'

type PaymentRow = {
  id: string
  invoice_number?: string | null
  invoice_type?: string | null
  total_due?: number | string | null
  payment_method?: string | null
  paid_at?: string | null
  campers?: { first_name?: string | null; last_name?: string | null; lot_number?: string | null } | null
  source?: 'invoice' | 'manual'
}

type DeliveryResult = {
  sent: boolean
  provider: 'sendgrid' | 'resend' | null
  providerMessageId?: string | null
  error?: string
}

const forest = rgb(0.102, 0.286, 0.176)
const softGreen = rgb(0.925, 0.952, 0.919)
const gold = rgb(0.72, 0.57, 0.25)
const ink = rgb(0.12, 0.19, 0.14)
const gray = rgb(0.38, 0.43, 0.39)
const line = rgb(0.82, 0.84, 0.8)

function safeText(value: unknown) {
  return String(value || '').replace(/[–—]/g, '-').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[^\x20-\x7E]/g, '').trim()
}

function centralDateKey(value: string) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value))
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value || ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

function paymentTime(value?: string | null) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return safeText(value)
  return date.toLocaleTimeString('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit' })
}

function reportDateLabel(value: string) {
  return new Date(`${value}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/Chicago' })
}

function camperName(row: PaymentRow) {
  return safeText(`${row.campers?.first_name || ''} ${row.campers?.last_name || ''}`) || 'Camper'
}

function fit(text: string, font: PDFFont, size: number, width: number) {
  const clean = safeText(text) || '-'
  if (font.widthOfTextAtSize(clean, size) <= width) return clean
  let shortened = clean
  while (shortened && font.widthOfTextAtSize(`${shortened}...`, size) > width) shortened = shortened.slice(0, -1)
  return `${shortened}...`
}

function drawHeader(page: PDFPage, bold: PDFFont, regular: PDFFont, reportDate: string, rows: PaymentRow[], total: number) {
  const { width, height } = page.getSize()
  page.drawRectangle({ x: 0, y: height - 105, width, height: 105, color: forest })
  page.drawText('BUR OAKS CAMPGROUND', { x: 38, y: height - 35, font: bold, size: 10, color: rgb(0.9, 0.79, 0.46) })
  page.drawText('Daily Payments Received', { x: 38, y: height - 70, font: bold, size: 25, color: rgb(1, 1, 1) })
  page.drawText(reportDateLabel(reportDate), { x: 445, y: height - 37, font: regular, size: 10, color: rgb(0.9, 0.94, 0.9) })
  page.drawText(`TOTAL PAID: $${total.toFixed(2)}`, { x: 445, y: height - 68, font: bold, size: 16, color: rgb(1, 1, 1) })
  page.drawText(`${rows.length} paid invoice${rows.length === 1 ? '' : 's'}`, { x: 445, y: height - 88, font: regular, size: 10, color: rgb(0.9, 0.94, 0.9) })

  page.drawRectangle({ x: 38, y: height - 140, width: width - 76, height: 25, color: softGreen })
  const headers = [['TIME', 44], ['LOT', 102], ['CAMPER', 150], ['INVOICE', 285], ['WHAT WAS PAID', 385], ['METHOD', 570], ['AMOUNT', 675]] as const
  headers.forEach(([label, x]) => page.drawText(label, { x, y: height - 131, font: bold, size: 8, color: forest }))
  return height - 146
}

export async function buildDailyPaymentPdf(rows: PaymentRow[], reportDate: string) {
  const pdf = await PDFDocument.create()
  pdf.setTitle(`Bur Oaks Daily Payments - ${reportDate}`)
  pdf.setAuthor('Bur Oaks Campground')
  pdf.setSubject('Daily payment register')
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const sorted = [...rows].sort((a, b) => String(a.paid_at || '').localeCompare(String(b.paid_at || '')))
  const total = sorted.reduce((sum, row) => sum + Number(row.total_due || 0), 0)
  const rowsPerPage = 12
  const pageGroups = sorted.length
    ? Array.from({ length: Math.ceil(sorted.length / rowsPerPage) }, (_, index) => sorted.slice(index * rowsPerPage, (index + 1) * rowsPerPage))
    : [[]]

  for (const group of pageGroups) {
    const page = pdf.addPage([792, 612])
    let y = drawHeader(page, bold, regular, reportDate, sorted, total)

    if (!sorted.length) {
      page.drawRectangle({ x: 120, y: 300, width: 552, height: 125, borderColor: line, borderWidth: 1.2, color: rgb(0.98, 0.985, 0.975) })
      page.drawText('NO PAYMENTS RECEIVED', { x: 248, y: 365, font: bold, size: 21, color: forest })
      page.drawText('No invoices were marked paid during this calendar day.', { x: 245, y: 337, font: regular, size: 11, color: gray })
      page.drawText('Daily total: $0.00', { x: 331, y: 315, font: bold, size: 12, color: gold })
    }

    for (const row of group) {
      const bottom = y - 34
      page.drawLine({ start: { x: 38, y: bottom }, end: { x: 754, y: bottom }, thickness: 0.7, color: line })
      page.drawText(paymentTime(row.paid_at), { x: 44, y: y - 21, font: regular, size: 8.5, color: gray })
      page.drawText(fit(String(row.campers?.lot_number || '-'), bold, 10, 42), { x: 102, y: y - 21, font: bold, size: 10, color: ink })
      page.drawText(fit(camperName(row), bold, 9.5, 126), { x: 150, y: y - 21, font: bold, size: 9.5, color: ink })
      page.drawText(fit(String(row.invoice_number || '-'), regular, 8.5, 92), { x: 285, y: y - 21, font: regular, size: 8.5, color: gray })
      page.drawText(fit(String(row.invoice_type || 'Campground invoice'), regular, 8.5, 176), { x: 385, y: y - 21, font: regular, size: 8.5, color: ink })
      page.drawText(fit(String(row.payment_method || 'Office / other'), regular, 8.2, 95), { x: 570, y: y - 21, font: regular, size: 8.2, color: gray })
      page.drawText(`$${Number(row.total_due || 0).toFixed(2)}`, { x: 675, y: y - 21, font: bold, size: 10, color: forest })
      y = bottom
    }
  }

  pdf.getPages().forEach((current, index, pages) => {
    current.drawText('Bur Oaks Campground - Office Payment Register', { x: 38, y: 20, font: regular, size: 8, color: gray })
    current.drawText(`Page ${index + 1} of ${pages.length}`, { x: 704, y: 20, font: regular, size: 8, color: gray })
  })
  return pdf.save()
}

function parseSender(value: string) {
  const match = value.trim().match(/^(.*?)<([^>]+)>$/)
  return match ? { name: match[1].trim().replace(/^"|"$/g, '') || undefined, email: match[2].trim() } : { email: value.trim() }
}

async function sendPaymentReportEmail(to: string, pdfBytes: Uint8Array, reportDate: string, count: number, total: number): Promise<DeliveryResult> {
  const from = (process.env.SENDGRID_FROM || process.env.ADMIN_ALERT_FROM || process.env.INVOICE_EMAIL_FROM || '').trim()
  if (!from) return { sent: false, provider: null, error: 'The campground email sender is not configured.' }
  const filename = `bur-oaks-daily-payments-${reportDate}.pdf`
  const subject = `Bur Oaks daily payments - ${reportDate} - $${total.toFixed(2)}`
  const text = `Daily payment register for ${reportDate}. ${count} paid invoice${count === 1 ? '' : 's'}. Total received: $${total.toFixed(2)}. The clear printable PDF is attached.`
  const attachment = Buffer.from(pdfBytes).toString('base64')

  if (process.env.SENDGRID_API_KEY) {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', { method: 'POST', headers: { Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ personalizations: [{ to: [{ email: to }], subject }], from: parseSender(from), reply_to: { email: parseSender(process.env.SENDGRID_REPLY_TO || 'buroakscampground@gmail.com').email }, content: [{ type: 'text/plain', value: text }, { type: 'text/html', value: `<p>${text}</p><p><strong>The printable PDF is attached.</strong></p>` }], attachments: [{ content: attachment, filename, type: 'application/pdf', disposition: 'attachment' }] }) })
    if (!response.ok) return { sent: false, provider: 'sendgrid', error: await response.text().catch(() => `SendGrid error ${response.status}`) }
    return { sent: true, provider: 'sendgrid', providerMessageId: response.headers.get('x-message-id') }
  }
  if (process.env.RESEND_API_KEY) {
    const response = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from, to: [to], reply_to: process.env.SENDGRID_REPLY_TO || 'buroakscampground@gmail.com', subject, text, html: `<p>${text}</p><p><strong>The printable PDF is attached.</strong></p>`, attachments: [{ filename, content: attachment }] }) })
    const result = await response.json().catch(() => ({}))
    if (!response.ok) return { sent: false, provider: 'resend', error: result.message || `Resend error ${response.status}` }
    return { sent: true, provider: 'resend', providerMessageId: result.id || null }
  }
  return { sent: false, provider: null, error: 'SendGrid or Resend is not configured.' }
}

export async function sendDailyPaymentReport(
  client: any,
  reportDate: string,
  options: { sendOffice?: boolean; sendPrinter?: boolean } = {},
) {
  const queryStart = `${reportDate}T00:00:00.000Z`
  const queryEnd = new Date(`${reportDate}T00:00:00.000Z`)
  queryEnd.setUTCDate(queryEnd.getUTCDate() + 2)
  const [invoiceResult, manualResult] = await Promise.all([
    client.from('invoices').select('id,invoice_number,invoice_type,total_due,payment_method,paid_at,campers(first_name,last_name,lot_number)').eq('status', 'paid').gte('paid_at', queryStart).lt('paid_at', queryEnd.toISOString()).order('paid_at', { ascending: true }),
    client.from('manual_payments').select('id,camper_id,amount,payment_method,payment_reference,received_on,created_at,campers(first_name,last_name,lot_number)').eq('received_on', reportDate).order('created_at', { ascending: true }),
  ])
  if (invoiceResult.error) throw new Error(invoiceResult.error.message)
  if (manualResult.error) throw new Error(manualResult.error.message)

  const manualPayments = manualResult.data || []
  const paymentIds = manualPayments.map((payment: any) => payment.id)
  const allocationResult = paymentIds.length
    ? await client.from('manual_payment_allocations').select('payment_id,invoice_id,amount_applied,invoices(invoice_number,invoice_type)').in('payment_id', paymentIds)
    : { data: [], error: null }
  if (allocationResult.error) throw new Error(allocationResult.error.message)
  const allocations = allocationResult.data || []
  const manuallyPaidInvoiceIds = new Set(allocations.map((allocation: any) => String(allocation.invoice_id)).filter(Boolean))
  const onlineRows = ((invoiceResult.data || []) as PaymentRow[])
    .filter((row) => row.paid_at && centralDateKey(row.paid_at) === reportDate && !manuallyPaidInvoiceIds.has(String(row.id)))
    .map((row) => ({ ...row, source: 'invoice' as const }))
  const manualRows = manualPayments.map((payment: any) => {
    const paymentAllocations = allocations.filter((allocation: any) => String(allocation.payment_id) === String(payment.id))
    const invoiceNumbers = paymentAllocations.map((allocation: any) => allocation.invoices?.invoice_number).filter(Boolean).join(', ')
    const invoiceTypes = [...new Set(paymentAllocations.map((allocation: any) => allocation.invoices?.invoice_type).filter(Boolean))].join(' + ')
    return {
      id: `manual-${payment.id}`,
      invoice_number: invoiceNumbers || 'Account credit',
      invoice_type: invoiceTypes || 'Office payment received',
      total_due: payment.amount,
      payment_method: payment.payment_method,
      paid_at: payment.created_at,
      campers: payment.campers,
      source: 'manual' as const,
    }
  }) as PaymentRow[]
  const rows = [...onlineRows, ...manualRows].sort((a, b) => String(a.paid_at || '').localeCompare(String(b.paid_at || '')))
  const total = rows.reduce((sum, row) => sum + Number(row.total_due || 0), 0)
  const pdfBytes = await buildDailyPaymentPdf(rows, reportDate)
  const officeEmail = process.env.PAYMENT_REPORT_EMAIL || process.env.PUMP_OUT_REPORT_EMAIL || 'buroakscampground@gmail.com'
  const printerEmails = uniquePrinterEmails([
    process.env.PAYMENT_REPORT_PRINTER_EMAILS,
    process.env.PUMP_OUT_PRINTER_EMAIL,
    process.env.PUMP_OUT_SECOND_PRINTER_EMAIL,
    process.env.PUMP_OUT_ADDITIONAL_PRINTER_EMAILS,
    'una63106xie2gt@print.epsonconnect.com',
    'hcv125660p5464@print.epsonconnect.com',
  ])
  const sendOffice = options.sendOffice !== false
  const sendPrinter = options.sendPrinter !== false
  const [office, printers] = await Promise.all([
    sendOffice ? sendPaymentReportEmail(officeEmail, pdfBytes, reportDate, rows.length, total) : Promise.resolve({ sent: true, provider: null } as DeliveryResult),
    sendPrinter ? Promise.all(printerEmails.map(async (email) => ({ email, delivery: await sendPaymentReportEmail(email, pdfBytes, reportDate, rows.length, total) }))) : Promise.resolve([]),
  ])
  const failed = printers.filter((item) => !item.delivery.sent)
  const printer: DeliveryResult = {
    sent: !sendPrinter || (printers.length > 0 && failed.length === 0),
    provider: printers.every((item) => item.delivery.provider === 'sendgrid') ? 'sendgrid' : printers.every((item) => item.delivery.provider === 'resend') ? 'resend' : null,
    providerMessageId: printers.map((item) => item.delivery.providerMessageId).filter(Boolean).join(',') || null,
    error: failed.map((item) => `${item.email}: ${item.delivery.error || 'delivery failed'}`).join(' | ') || undefined,
  }
  return { rows, total, pdfBytes, office, printer, printers, officeEmail, printerEmails, sentOffice: sendOffice, sentPrinter: sendPrinter }
}
