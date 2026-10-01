import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { consentedCamperSmsPhones } from '../../../lib/camper-sms'
import { singleSegmentSms } from '../../../lib/sms-segments'
import { sendTwilioSms } from '../../../lib/twilio-sms'

const CAMPER_ID = 'bef59ee4-f3ad-4892-ab1a-6baf7b5ba0d8'
const RENT_INVOICE_ID = '0b97ee9b-7ea7-4a12-8a08-1e15bc0e7800'
const ELECTRIC_INVOICE_ID = '72f52779-abdf-4cf9-ad40-aee51448cd80'
const AUTOMATION_KEY = 'manual-max-2026-10-01-rent-electric'
const ONE_TIME_KEY = 'gmove_5e4a714c63c546819d8ac4dfbbfbbf0d'

export async function POST(request: Request) {
  if (request.headers.get('x-one-time-key') !== ONE_TIME_KEY) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'Messaging database is unavailable.' }, { status: 503 })
  }

  const admin = createClient(supabaseUrl, serviceKey)
  const { data: camper, error: camperError } = await admin
    .from('campers')
    .select('id,lot_number,first_name,last_name,phone,alternate_phone,second_profile_phone,sms_opt_in,active')
    .eq('id', CAMPER_ID)
    .single()

  if (camperError || !camper || !camper.active || !camper.sms_opt_in) {
    return NextResponse.json({ error: camperError?.message || 'Max James is not currently eligible for texts.' }, { status: 409 })
  }

  const { data: invoices, error: invoiceError } = await admin
    .from('invoices')
    .select('id,invoice_number,invoice_type,total_due,due_date,status')
    .in('id', [RENT_INVOICE_ID, ELECTRIC_INVOICE_ID])

  if (invoiceError) return NextResponse.json({ error: invoiceError.message }, { status: 500 })
  const rent = invoices?.find((invoice) => invoice.id === RENT_INVOICE_ID)
  const electric = invoices?.find((invoice) => invoice.id === ELECTRIC_INVOICE_ID)
  if (!rent || !electric || String(rent.status).toLowerCase() !== 'sent' || String(electric.status).toLowerCase() !== 'sent') {
    return NextResponse.json({ error: 'One or both invoices are no longer open.' }, { status: 409 })
  }

  const phones = await consentedCamperSmsPhones(admin, camper)
  const primaryPhone = phones.find((phone: string) => phone.endsWith('3949'))
  if (!primaryPhone) return NextResponse.json({ error: 'Max’s newly opted-in phone is unavailable.' }, { status: 409 })

  const { data: prior, error: priorError } = await admin
    .from('text_reminders')
    .select('id,status,provider_message_id')
    .eq('invoice_id', RENT_INVOICE_ID)
    .eq('automation_key', AUTOMATION_KEY)
    .eq('recipient_phone', primaryPhone)
    .maybeSingle()

  if (priorError) return NextResponse.json({ error: priorError.message }, { status: 500 })
  if (prior?.status === 'sent') {
    return NextResponse.json({ status: 'already_sent', phoneLast4: '3949', providerMessageId: prior.provider_message_id })
  }

  const message = singleSegmentSms({
    message: 'LOT RENT $375 DUE TODAY. ELECTRIC $122.12 DUE OCT 12.',
    url: 'https://www.buroakscampground.com/invoices',
    action: 'Pay',
  })

  let reminderId = prior?.id
  if (!reminderId) {
    const { data: reservation, error: reservationError } = await admin
      .from('text_reminders')
      .insert({
        camper_id: CAMPER_ID,
        invoice_id: RENT_INVOICE_ID,
        reminder_type: 'Lot Rent + Electric Reminder',
        message,
        sent_at: new Date().toISOString(),
        status: 'sending',
        recipient_phone: primaryPhone,
        provider: 'twilio',
        provider_message_id: null,
        error_message: null,
        sent_by: 'admin-confirmed-manual-send',
        reminder_date: '2026-10-01',
        automation_key: AUTOMATION_KEY,
      })
      .select('id')
      .single()

    if (reservationError) return NextResponse.json({ error: reservationError.message }, { status: 500 })
    reminderId = reservation.id
  }

  const result = await sendTwilioSms({ to: primaryPhone, body: message, client: admin, camperId: CAMPER_ID })
  const { error: updateError } = await admin
    .from('text_reminders')
    .update({
      status: result.sent ? 'sent' : 'failed',
      provider_message_id: result.sent ? result.providerMessageId : null,
      error_message: result.sent ? null : result.error,
      sent_at: new Date().toISOString(),
    })
    .eq('id', reminderId)

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })
  if (!result.sent) return NextResponse.json({ error: result.error || 'Text failed.' }, { status: 502 })

  return NextResponse.json({ status: 'sent', phoneLast4: '3949', providerMessageId: result.providerMessageId, message })
}
