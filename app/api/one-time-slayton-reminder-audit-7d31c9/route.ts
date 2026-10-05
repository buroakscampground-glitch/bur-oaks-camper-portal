import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { consentedCamperSmsPhones } from '../../../lib/camper-sms'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mzywctpxnpejglnspyqi.supabase.co'

function maskPhone(value: unknown) {
  const digits = String(value || '').replace(/\D/g, '')
  return digits.length >= 4 ? `***-***-${digits.slice(-4)}` : 'Saved phone'
}

async function twilioStatus(messageId: string) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  if (!accountSid || !authToken || !messageId) return { status: '', error: '' }

  const authorization = `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages/${encodeURIComponent(messageId)}.json`,
    { headers: { Authorization: authorization }, cache: 'no-store' }
  )
  const result = await response.json().catch(() => ({}))
  return {
    status: response.ok ? String(result.status || '') : '',
    error: response.ok ? String(result.error_message || '') : String(result.message || `Status check failed (${response.status}).`),
  }
}

export async function GET() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) return NextResponse.json({ error: 'Service key unavailable.' }, { status: 500 })
  const admin = createClient(supabaseUrl, serviceRoleKey)

  const { data: campers, error: camperError } = await admin
    .from('campers')
    .select('id,lot_number,first_name,last_name,phone,alternate_phone,second_profile_phone,sms_opt_in,active')
    .ilike('last_name', '%slayton%')

  if (camperError) return NextResponse.json({ error: camperError.message }, { status: 500 })
  const camperIds = (campers || []).map((camper) => camper.id)
  const { data: invoices, error: invoiceError } = camperIds.length
    ? await admin
      .from('invoices')
      .select('id,camper_id,invoice_number,invoice_type,total_due,due_date,status,late_fee,paid_at,created_at')
      .in('camper_id', camperIds)
      .gte('due_date', '2026-09-01')
      .order('due_date', { ascending: false })
    : { data: [], error: null }

  if (invoiceError) return NextResponse.json({ error: invoiceError.message }, { status: 500 })
  const invoiceIds = (invoices || []).map((invoice) => invoice.id)
  const { data: reminders, error: reminderError } = invoiceIds.length
    ? await admin
      .from('text_reminders')
      .select('id,invoice_id,reminder_type,message,status,recipient_phone,provider_message_id,error_message,sent_at,automation_key')
      .in('invoice_id', invoiceIds)
      .order('sent_at', { ascending: false })
    : { data: [], error: null }

  if (reminderError) return NextResponse.json({ error: reminderError.message }, { status: 500 })

  const providerRows = await Promise.all((reminders || []).map(async (reminder) => ({
    ...reminder,
    recipient_phone: maskPhone(reminder.recipient_phone),
    provider: await twilioStatus(String(reminder.provider_message_id || '')),
  })))
  const camperRows = await Promise.all((campers || []).map(async (camper) => ({
    id: camper.id,
    lot: camper.lot_number,
    name: `${camper.first_name || ''} ${camper.last_name || ''}`.trim(),
    active: camper.active,
    householdSmsOptIn: camper.sms_opt_in,
    optedInPhones: (await consentedCamperSmsPhones(admin, camper)).map(maskPhone),
  })))

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    campers: camperRows,
    invoices,
    reminders: providerRows,
  }, { headers: { 'Cache-Control': 'no-store' } })
}
