import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import { uniquePrinterEmails } from './report-printer-emails.ts'
import type { StripePayoutDetail, StripePayoutRow } from './stripe-payout-reconciliation.ts'

type DeliveryResult = { sent: boolean; provider: 'sendgrid' | 'resend' | null; providerMessageId?: string | null; error?: string }

const forest = rgb(0.102, 0.286, 0.176)
const softGreen = rgb(0.925, 0.952, 0.919)
const ink = rgb(0.12, 0.19, 0.14)
const gray = rgb(0.38, 0.43, 0.39)
const line = rgb(0.82, 0.84, 0.8)
const gold = rgb(0.72, 0.57, 0.25)

function dollars(cents: number) {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

function clean(value: unknown) {
  return String(value || '').replace(/[–—]/g, '-').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[^\x20-\x7E]/g, '').trim()
}

function fit(value: unknown, font: PDFFont, size: number, width: number) {
  const text = clean(value) || '-'
  if (font.widthOfTextAtSize(text, size) <= width) return text
  let shortened = text
  while (shortened && font.widthOfTextAtSize(`${shortened}...`, size) > width) shortened = shortened.slice(0, -1)
  return `${shortened}...`
}

function dateLabel(value: string) {
  return new Date(value).toLocaleDateString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', year: 'numeric' })
}

function rowIdentity(row: StripePayoutRow) {
  if (!row.invoices.length) return clean(row.description)
  return row.invoices.map((invoice) => `Lot ${invoice.lot} - ${invoice.camper}`).join(', ')
}

function rowInvoice(row: StripePayoutRow) {
  if (!row.invoices.length) return row.type.replaceAll('_', ' ')
  const invoices = row.invoices.map((invoice) => `${invoice.invoiceNumber} ${dollars(invoice.amountCents)} (${invoice.invoiceType})`).join(', ')
  return row.camperCheckoutFeeCents > 0 ? `${invoices}, checkout fee ${dollars(row.camperCheckoutFeeCents)}` : invoices
}

function drawHeader(page: PDFPage, bold: PDFFont, regular: PDFFont, detail: StripePayoutDetail) {
  const { width, height } = page.getSize()
  page.drawRectangle({ x: 0, y: height - 112, width, height: 112, color: forest })
  page.drawText('BUR OAKS CAMPGROUND', { x: 38, y: height - 35, font: bold, size: 10, color: rgb(0.9, 0.79, 0.46) })
  page.drawText('Stripe Bank Deposit', { x: 38, y: height - 70, font: bold, size: 25, color: rgb(1, 1, 1) })
  page.drawText('Exact payout reconciliation', { x: 38, y: height - 91, font: regular, size: 11, color: rgb(0.9, 0.94, 0.9) })
  page.drawText(`DEPOSIT: ${dollars(detail.amountCents)}`, { x: 560, y: height - 50, font: bold, size: 16, color: rgb(1, 1, 1) })
  page.drawText(`Arrival: ${dateLabel(detail.arrivalDate)}`, { x: 560, y: height - 73, font: regular, size: 10, color: rgb(0.9, 0.94, 0.9) })
  page.drawText(fit(detail.id, regular, 8, 190), { x: 560, y: height - 91, font: regular, size: 8, color: rgb(0.9, 0.94, 0.9) })
  page.drawRectangle({ x: 38, y: height - 147, width: width - 76, height: 25, color: softGreen })
  const headers = [['DATE', 44], ['CAMPER / LOT OR ITEM', 108], ['INVOICE / TYPE', 340], ['GROSS', 585], ['STRIPE FEE', 660], ['NET', 740]] as const
  headers.forEach(([label, x]) => page.drawText(label, { x, y: height - 138, font: bold, size: 8, color: forest }))
  return height - 153
}

export async function buildStripePayoutPdf(detail: StripePayoutDetail) {
  const pdf = await PDFDocument.create()
  pdf.setTitle(`Bur Oaks Stripe Deposit ${detail.id}`)
  pdf.setAuthor('Bur Oaks Campground')
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const groups = detail.rows.length
    ? Array.from({ length: Math.ceil(detail.rows.length / 14) }, (_, index) => detail.rows.slice(index * 14, (index + 1) * 14))
    : [[]]

  for (const [groupIndex, group] of groups.entries()) {
    const page = pdf.addPage([842, 612])
    let y = drawHeader(page, bold, regular, detail)
    for (const row of group) {
      const bottom = y - 29
      page.drawLine({ start: { x: 38, y: bottom }, end: { x: 804, y: bottom }, thickness: 0.7, color: line })
      page.drawText(dateLabel(row.created), { x: 44, y: y - 19, font: regular, size: 8, color: gray })
      page.drawText(fit(rowIdentity(row), bold, 8.5, 220), { x: 108, y: y - 19, font: bold, size: 8.5, color: ink })
      page.drawText(fit(rowInvoice(row), regular, 8, 235), { x: 340, y: y - 19, font: regular, size: 8, color: gray })
      page.drawText(dollars(row.grossCents), { x: 585, y: y - 19, font: regular, size: 8.5, color: ink })
      page.drawText(dollars(row.feeCents), { x: 660, y: y - 19, font: regular, size: 8.5, color: row.feeCents < 0 ? rgb(0.65, 0.18, 0.15) : ink })
      page.drawText(dollars(row.netCents), { x: 740, y: y - 19, font: bold, size: 8.5, color: forest })
      y = bottom
    }

    if (groupIndex === groups.length - 1) {
      const boxY = Math.max(62, y - 112)
      page.drawRectangle({ x: 470, y: boxY, width: 334, height: 94, borderColor: line, borderWidth: 1, color: rgb(0.98, 0.985, 0.975) })
      const summary = detail.summary
      page.drawText(`Camper payments: ${dollars(summary.paymentGrossCents)}`, { x: 485, y: boxY + 72, font: regular, size: 9, color: ink })
      page.drawText(`Refunds / reversals: ${dollars(summary.refundsCents)}`, { x: 485, y: boxY + 55, font: regular, size: 9, color: ink })
      page.drawText(`Other adjustments: ${dollars(summary.adjustmentsCents)}`, { x: 485, y: boxY + 38, font: regular, size: 9, color: ink })
      page.drawText(`Stripe fees: ${dollars(summary.stripeFeesCents)}`, { x: 630, y: boxY + 72, font: regular, size: 9, color: ink })
      page.drawText(`NET DEPOSIT: ${dollars(summary.payoutCents)}`, { x: 630, y: boxY + 51, font: bold, size: 11, color: forest })
      page.drawText(`Difference: ${dollars(summary.differenceCents)}`, { x: 630, y: boxY + 31, font: bold, size: 10, color: summary.differenceCents === 0 ? forest : rgb(0.7, 0.15, 0.12) })
      page.drawText(summary.differenceCents === 0 ? 'RECONCILED TO THE PENNY' : 'REVIEW REQUIRED - TOTALS DO NOT MATCH', { x: 485, y: boxY + 12, font: bold, size: 8, color: summary.differenceCents === 0 ? gold : rgb(0.7, 0.15, 0.12) })
    }
  }

  pdf.getPages().forEach((page, index, pages) => {
    page.drawText('Bur Oaks Campground - Stripe Deposit Reconciliation', { x: 38, y: 20, font: regular, size: 8, color: gray })
    page.drawText(`Page ${index + 1} of ${pages.length}`, { x: 750, y: 20, font: regular, size: 8, color: gray })
  })
  return pdf.save()
}

function parseSender(value: string) {
  const match = value.trim().match(/^(.*?)<([^>]+)>$/)
  return match ? { name: match[1].trim().replace(/^"|"$/g, '') || undefined, email: match[2].trim() } : { email: value.trim() }
}

async function sendPdf(to: string, pdfBytes: Uint8Array, detail: StripePayoutDetail): Promise<DeliveryResult> {
  const from = (process.env.SENDGRID_FROM || process.env.ADMIN_ALERT_FROM || process.env.INVOICE_EMAIL_FROM || '').trim()
  if (!from) return { sent: false, provider: null, error: 'The campground email sender is not configured.' }
  const date = detail.arrivalDate.slice(0, 10)
  const filename = `bur-oaks-stripe-deposit-${date}-${detail.id}.pdf`
  const subject = `Stripe deposit ${dollars(detail.amountCents)} - ${date}`
  const text = `Exact Stripe deposit reconciliation for ${dollars(detail.amountCents)} arriving ${date}. The itemized printable PDF is attached.`
  const attachment = Buffer.from(pdfBytes).toString('base64')
  if (process.env.SENDGRID_API_KEY) {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', { method: 'POST', headers: { Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ personalizations: [{ to: [{ email: to }], subject }], from: parseSender(from), content: [{ type: 'text/plain', value: text }], attachments: [{ content: attachment, filename, type: 'application/pdf', disposition: 'attachment' }] }) })
    if (!response.ok) return { sent: false, provider: 'sendgrid', error: await response.text().catch(() => `SendGrid error ${response.status}`) }
    return { sent: true, provider: 'sendgrid', providerMessageId: response.headers.get('x-message-id') }
  }
  if (process.env.RESEND_API_KEY) {
    const response = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from, to: [to], subject, text, attachments: [{ filename, content: attachment }] }) })
    const result = await response.json().catch(() => ({}))
    if (!response.ok) return { sent: false, provider: 'resend', error: result.message || `Resend error ${response.status}` }
    return { sent: true, provider: 'resend', providerMessageId: result.id || null }
  }
  return { sent: false, provider: null, error: 'SendGrid or Resend is not configured.' }
}

export async function printStripePayoutReport(detail: StripePayoutDetail) {
  const pdfBytes = await buildStripePayoutPdf(detail)
  const printerEmails = uniquePrinterEmails([
    process.env.PAYMENT_REPORT_PRINTER_EMAILS,
    process.env.PUMP_OUT_PRINTER_EMAIL,
    process.env.PUMP_OUT_SECOND_PRINTER_EMAIL,
    process.env.PUMP_OUT_ADDITIONAL_PRINTER_EMAILS,
    'una63106xie2gt@print.epsonconnect.com',
    'hcv125660p5464@print.epsonconnect.com',
  ])
  const printers = await Promise.all(printerEmails.map(async (email) => ({ email, delivery: await sendPdf(email, pdfBytes, detail) })))
  const failures = printers.filter((item) => !item.delivery.sent)
  return { pdfBytes, printerEmails, printers, sent: printers.length > 0 && failures.length === 0, error: failures.map((item) => `${item.email}: ${item.delivery.error || 'delivery failed'}`).join(' | ') || undefined }
}
