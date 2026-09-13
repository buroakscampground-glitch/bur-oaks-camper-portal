import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { createGuestInvoicePaymentToken } from '../../../lib/final-invoice-token'
import { getSiteUrl } from '../../../lib/site-url'
import { formatSmsPhone, sendTwilioSms } from '../../../lib/twilio-sms'

export const runtime = 'nodejs'

const ONE_TIME_KEY = 'max_james_payment_6f8e4a93c2d1'
const CAMPER_ID = 'bef59ee4-f3ad-4892-ab1a-6baf7b5ba0d8'
const INVOICE_ID = '886f55d9-5cf0-4f79-9d11-b759f9a9c0e4'
const PHONE = '+16186103949'

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase is not configured.')
  return createClient(url, key)
}

export async function POST(request: Request) {
  if (request.headers.get('x-one-time-key') !== ONE_TIME_KEY) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  try {
    const admin = adminClient()
    const { data: invoice, error } = await admin
      .from('invoices')
      .select('id,camper_id,invoice_number,invoice_type,total_due,due_date,status,campers(id,first_name,last_name,lot_number,active)')
      .eq('id', INVOICE_ID)
      .maybeSingle()
    const camper = Array.isArray(invoice?.campers) ? invoice.campers[0] : invoice?.campers
    if (error || !invoice || String(invoice.camper_id) !== CAMPER_ID || !camper || camper.active === false) {
      return NextResponse.json({ error: error?.message || 'Max James’s active invoice was not found.' }, { status: 404 })
    }
    if (!String(invoice.invoice_type || '').toLowerCase().includes('electric')) {
      return NextResponse.json({ error: 'The selected invoice is not Max James’s electric bill.' }, { status: 400 })
    }
    if (['paid', 'processing', 'void', 'canceled', 'cancelled'].includes(String(invoice.status || '').toLowerCase())) {
      return NextResponse.json({ error: `This invoice is already ${invoice.status}.` }, { status: 400 })
    }

    const amount = Number(invoice.total_due || 0)
    const token = createGuestInvoicePaymentToken(INVOICE_ID, CAMPER_ID)
    const paymentUrl = `${getSiteUrl()}/final-invoice/${encodeURIComponent(token)}`
    const message = `Bur Oaks Campground: Max, your Lot 39 electric bill is $${amount.toFixed(2)}. Pay this invoice securely without a portal login: ${paymentUrl} Reply STOP to opt out.`
    const phone = formatSmsPhone(PHONE)
    const automationKey = 'one-time-max-james-electric-payment-link-2026-09-13'
    const { data: prior } = await admin.from('text_reminders').select('id,status,provider_message_id').eq('invoice_id', INVOICE_ID).eq('automation_key', automationKey).eq('recipient_phone', phone).maybeSingle()
    if (prior?.status === 'sent') {
      return NextResponse.json({ success: true, skipped: true, amount, phone, providerMessageId: prior.provider_message_id })
    }

    const result = await sendTwilioSms({ to: phone, body: message, client: admin, camperId: CAMPER_ID })
    const log = {
      camper_id: CAMPER_ID,
      invoice_id: INVOICE_ID,
      reminder_type: 'One-Time Electric Payment Link',
      message,
      sent_at: new Date().toISOString(),
      status: result.sent ? 'sent' : 'failed',
      recipient_phone: phone,
      provider: 'twilio',
      provider_message_id: result.sent ? result.providerMessageId : null,
      error_message: result.sent ? null : result.error,
      sent_by: 'approved-one-time-max-james-payment-link',
      reminder_date: '2026-09-13',
      automation_key: automationKey,
    }
    if (prior?.id) await admin.from('text_reminders').update(log).eq('id', prior.id)
    else await admin.from('text_reminders').insert(log)
    if (!result.sent) return NextResponse.json({ error: result.error || 'The text could not be sent.' }, { status: 502 })

    return NextResponse.json({ success: true, sent: true, amount, phone, invoiceNumber: invoice.invoice_number, providerMessageId: result.providerMessageId })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || String(error) }, { status: 500 })
  }
}
