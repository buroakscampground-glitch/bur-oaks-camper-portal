import { NextResponse } from 'next/server'
import { getAuthenticatedContext } from '../../../lib/server-auth'
import { createFinalInvoiceToken } from '../../../lib/final-invoice-token'
import { formatSmsPhone, isTwilioConfigured, sendTwilioSms } from '../../../lib/twilio-sms'

function invoiceCamper(invoice: any) {
  if (Array.isArray(invoice?.campers)) return invoice.campers[0] || null
  return invoice?.campers || null
}

function money(value: unknown) {
  return Number(value || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

function dueDate(value?: string | null) {
  if (!value) return 'soon'
  return new Date(`${value}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export async function POST(request: Request) {
  const context = await getAuthenticatedContext(request)
  if (!context || String(context.camper.role || '').toLowerCase() !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const invoiceId = String(body.invoiceId || '')
  const phone = formatSmsPhone(body.phone)
  if (!invoiceId || !phone) {
    return NextResponse.json({ error: 'Choose an invoice and enter a valid mobile number.' }, { status: 400 })
  }
  if (!isTwilioConfigured()) {
    return NextResponse.json({ error: 'Twilio is not connected.' }, { status: 503 })
  }

  const { data: invoice, error } = await context.admin
    .from('invoices')
    .select('id,camper_id,invoice_number,total_due,due_date,status,campers(id,first_name,last_name,lot_number,active)')
    .eq('id', invoiceId)
    .maybeSingle()

  if (error || !invoice) {
    return NextResponse.json({ error: error?.message || 'Invoice was not found.' }, { status: 404 })
  }

  const camper = invoiceCamper(invoice)
  if (!camper || camper.active !== false) {
    return NextResponse.json({ error: 'Private final-payment links are only used for archived campers.' }, { status: 400 })
  }

  const status = String(invoice.status || '').toLowerCase()
  if (status === 'paid' || status === 'processing') {
    return NextResponse.json({ error: status === 'paid' ? 'This invoice is already paid.' : 'A payment is already processing.' }, { status: 400 })
  }

  const token = createFinalInvoiceToken(String(invoice.id), String(camper.id))
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.buroakscampground.com'
  const paymentUrl = `${siteUrl}/final-invoice/${encodeURIComponent(token)}`
  const message = `Bur Oaks Campground: ${camper.first_name || 'Camper'}, final invoice #${invoice.invoice_number || invoice.id} for site ${camper.lot_number || '-'} is ${money(invoice.total_due)}, due ${dueDate(invoice.due_date)}. Pay securely by card or checking/ACH: ${paymentUrl}\nThis private link opens only this invoice and closes after payment. Reply STOP to opt out.`
  const reminderDate = new Date().toISOString().slice(0, 10)
  const phoneKey = phone.replace(/\D/g, '')
  const automationKey = `final-invoice-payment-link-sms-${phoneKey}`

  const { data: existing } = await context.admin
    .from('text_reminders')
    .select('id,status')
    .eq('invoice_id', invoice.id)
    .eq('automation_key', automationKey)
    .eq('reminder_date', reminderDate)
    .maybeSingle()

  if (existing?.status === 'sent') {
    return NextResponse.json({ success: true, skipped: true, message: 'This private payment link was already texted to that number today.' })
  }

  const result = await sendTwilioSms({ to: phone, body: message })
  const logRow = {
    camper_id: camper.id,
    invoice_id: invoice.id,
    reminder_type: 'Final Invoice Payment Link',
    message,
    sent_at: new Date().toISOString(),
    status: result.sent ? 'sent' : 'failed',
    recipient_phone: phone,
    provider: 'twilio',
    provider_message_id: result.sent ? result.providerMessageId : null,
    error_message: result.sent ? null : result.error,
    sent_by: context.user.email || 'office',
    reminder_date: reminderDate,
    automation_key: automationKey,
  }

  if (existing?.id) {
    await context.admin.from('text_reminders').update(logRow).eq('id', existing.id)
  } else {
    await context.admin.from('text_reminders').insert(logRow)
  }

  if (!result.sent) {
    return NextResponse.json({ error: result.error || 'The payment-link text could not be sent.' }, { status: 502 })
  }

  return NextResponse.json({ success: true, sent: true, phone, amount: Number(invoice.total_due || 0), invoiceNumber: invoice.invoice_number })
}
