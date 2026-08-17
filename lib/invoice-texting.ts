import { formatSmsPhone, isTwilioConfigured, sendTwilioSms } from './twilio-sms'
import { portalSmsUrl } from './portal-sms-links'

type InvoiceTextKind = 'new' | 'due_3_days' | 'due_1_day' | 'due_today' | 'past_due'

type SendInvoiceTextOptions = {
  client: any
  invoiceId: string
  kind: InvoiceTextKind
  automationKey: string
  reminderDate: string
  sentBy?: string | null
}

export function todayInCentral() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())

  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  const day = parts.find((part) => part.type === 'day')?.value

  return `${year}-${month}-${day}`
}

export function daysUntilDate(dateValue: string, todayValue = todayInCentral()) {
  const toUtc = (value: string) => {
    const [year, month, day] = value.split('-').map(Number)
    return Date.UTC(year, month - 1, day)
  }

  return Math.round((toUtc(dateValue) - toUtc(todayValue)) / 86_400_000)
}

function money(value: unknown) {
  return Number(value || 0).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  })
}

function prettyDate(value?: string | null) {
  if (!value) return 'soon'
  const date = new Date(`${value}T12:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function invoiceCamper(invoice: any) {
  if (Array.isArray(invoice?.campers)) return invoice.campers[0] || null
  return invoice?.campers || null
}

function buildInvoiceSms(invoice: any, kind: InvoiceTextKind) {
  const invoiceNumber = invoice.invoice_number || 'new invoice'
  const total = money(invoice.total_due)
  const due = prettyDate(invoice.due_date)
  const invoiceUrl = portalSmsUrl(`/invoices/${invoice.id}`)

  if (kind === 'new') {
    return `Bur Oaks Campground: You have a new invoice #${invoiceNumber} for ${total} due ${due}.\nClick here to view and pay: ${invoiceUrl}\nReply STOP to opt out.`
  }

  if (kind === 'due_3_days') {
    return `Bur Oaks Campground: Reminder — invoice #${invoiceNumber} for ${total} is due in 3 days on ${due}.\nClick here to view and pay: ${invoiceUrl}\nReply STOP to opt out.`
  }

  if (kind === 'due_1_day') {
    return `Bur Oaks Campground: Reminder — invoice #${invoiceNumber} for ${total} is due tomorrow, ${due}.\nClick here to view and pay: ${invoiceUrl}\nReply STOP to opt out.`
  }

  if (kind === 'due_today') {
    return `Bur Oaks Campground: Reminder — invoice #${invoiceNumber} for ${total} is due today, ${due}.\nClick here to view and pay: ${invoiceUrl}\nReply STOP to opt out.`
  }

  return `Bur Oaks Campground: Past due reminder — invoice #${invoiceNumber} for ${total} was due ${due}. Please pay or contact the office.\nClick here to view and pay: ${invoiceUrl}\nReply STOP to opt out.`
}

export async function sendInvoiceText({
  client,
  invoiceId,
  kind,
  automationKey,
  reminderDate,
  sentBy = 'automation',
}: SendInvoiceTextOptions) {
  if (!isTwilioConfigured()) {
    return { status: 'skipped', reason: 'Twilio is not connected yet.' }
  }

  const { data: invoice, error: invoiceError } = await client
    .from('invoices')
    .select(`
      id,
      camper_id,
      invoice_number,
      invoice_type,
      total_due,
      due_date,
      status,
      campers (id, lot_number, first_name, last_name, phone, sms_opt_in, active)
    `)
    .eq('id', invoiceId)
    .single()

  if (invoiceError || !invoice) {
    return { status: 'failed', error: invoiceError?.message || 'Invoice was not found.' }
  }

  const invoiceStatus = String(invoice.status || '').toLowerCase()
  if (invoiceStatus === 'paid' || invoiceStatus === 'processing') {
    return {
      status: 'skipped',
      reason: invoiceStatus === 'paid' ? 'Invoice is already paid.' : 'A payment is already processing.',
    }
  }

  const camper = invoiceCamper(invoice)
  if (!camper?.active) {
    return { status: 'skipped', reason: 'Camper is not active.' }
  }

  if (!camper.sms_opt_in) {
    return { status: 'skipped', reason: 'Camper has not opted into text alerts.' }
  }

  const phone = formatSmsPhone(camper.phone)
  if (!phone) {
    return { status: 'skipped', reason: 'Camper does not have a valid phone number.' }
  }

  const { data: existing } = await client
    .from('text_reminders')
    .select('id,status')
    .eq('invoice_id', invoice.id)
    .eq('automation_key', automationKey)
    .eq('reminder_date', reminderDate)
    .maybeSingle()

  if (existing) {
    return { status: 'skipped', reason: 'This invoice text was already handled today.' }
  }

  const message = buildInvoiceSms(invoice, kind)
  const reservationRow = {
    camper_id: camper.id,
    invoice_id: invoice.id,
    reminder_type:
      kind === 'new'
        ? 'New Invoice'
        : kind === 'due_3_days'
          ? 'Invoice Due in 3 Days'
          : kind === 'due_1_day'
            ? 'Invoice Due Tomorrow'
            : kind === 'due_today'
              ? 'Invoice Due Today'
              : 'Past Due Invoice',
    message,
    sent_at: new Date().toISOString(),
    status: 'sending',
    recipient_phone: phone,
    provider: 'twilio',
    provider_message_id: null,
    error_message: null,
    sent_by: sentBy,
    reminder_date: reminderDate,
    automation_key: automationKey,
  }

  // Reserve the unique automation key before contacting Twilio so concurrent
  // requests cannot both send the same message.
  const { data: reservation, error: logError } = await client
    .from('text_reminders')
    .insert(reservationRow)
    .select('id')
    .single()

  if (logError?.code === '23505') {
    return { status: 'skipped', reason: 'This invoice text was already handled today.' }
  }

  if (logError) {
    return { status: 'failed', error: logError.message }
  }

  const result = await sendTwilioSms({ to: phone, body: message })
  const { error: updateError } = await client
    .from('text_reminders')
    .update({
      status: result.sent ? 'sent' : 'failed',
      provider_message_id: result.sent ? result.providerMessageId : null,
      error_message: result.sent ? null : result.error,
      sent_at: new Date().toISOString(),
    })
    .eq('id', reservation.id)

  if (updateError) {
    console.error('Unable to finalize invoice text reminder log:', updateError.code)
  }

  if (!result.sent) {
    return { status: 'failed', error: result.error }
  }

  return { status: 'sent', providerMessageId: result.providerMessageId }
}
