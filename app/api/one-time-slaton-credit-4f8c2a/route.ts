import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { consentedCamperSmsPhones, phoneAutomationKey } from '../../../lib/camper-sms'
import { sendTwilioSms } from '../../../lib/twilio-sms'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mzywctpxnpejglnspyqi.supabase.co'
const CAMPER_ID = '35846ccf-540f-4201-aa69-f76979d42c76'
const INVOICE_ID = '38fd095c-69ac-416e-a84e-56280c83ff47'
const AUTOMATION_KEY = 'manual-credit-applied-slaton-2026-10-05'

function adminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  return serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey) : null
}

function money(value: unknown) {
  return Number(value || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

function maskPhone(value: unknown) {
  const digits = String(value || '').replace(/\D/g, '')
  return digits.length >= 4 ? `***-***-${digits.slice(-4)}` : 'Saved phone'
}

async function loadTwilioStatus(messageId: string) {
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

async function currentState(admin: any) {
  const [camperResult, invoiceResult, creditResult, reminderResult] = await Promise.all([
    admin.from('campers').select('id,lot_number,first_name,last_name,phone,alternate_phone,second_profile_phone,sms_opt_in,active').eq('id', CAMPER_ID).single(),
    admin.from('invoices').select('id,camper_id,invoice_number,invoice_type,total_due,due_date,status,late_fee').eq('id', INVOICE_ID).single(),
    admin.from('account_credits').select('id,remaining_amount,status').eq('camper_id', CAMPER_ID).eq('status', 'active').gt('remaining_amount', 0),
    admin.from('text_reminders').select('id,status,recipient_phone,provider_message_id,error_message,sent_at,automation_key,message').eq('invoice_id', INVOICE_ID).like('automation_key', `${AUTOMATION_KEY}%`).order('sent_at', { ascending: false }),
  ])
  const error = camperResult.error || invoiceResult.error || creditResult.error || reminderResult.error
  if (error) throw error
  const availableCredit = Number((creditResult.data || []).reduce((sum: number, credit: any) => sum + Number(credit.remaining_amount || 0), 0).toFixed(2))
  return { camper: camperResult.data, invoice: invoiceResult.data, availableCredit, reminders: reminderResult.data || [] }
}

export async function POST() {
  const admin = adminClient()
  if (!admin) return NextResponse.json({ error: 'Service key unavailable.' }, { status: 500 })

  try {
    const before = await currentState(admin)
    if (String(before.camper.last_name || '').toLowerCase() !== 'slaton' || String(before.camper.lot_number) !== '43') {
      return NextResponse.json({ error: 'The saved camper record no longer matches Shawn Slaton at Lot 43.' }, { status: 409 })
    }
    if (String(before.invoice.camper_id) !== CAMPER_ID || before.invoice.due_date !== '2026-10-01' || !/lot rent/i.test(String(before.invoice.invoice_type || ''))) {
      return NextResponse.json({ error: 'The intended October 1 lot-rent invoice no longer matches.' }, { status: 409 })
    }

    let appliedTotal = 0
    if (Number(before.invoice.total_due) === 375 && before.availableCredit === 125) {
      const { data, error } = await admin.rpc('apply_account_credits_to_invoice_atomic', {
        p_camper_id: CAMPER_ID,
        p_invoice_id: INVOICE_ID,
        p_invoice_total: 375,
        p_applied_by: 'office-request-2026-10-05',
      })
      if (error) throw error
      appliedTotal = Number(data?.appliedTotal || 0)
    } else if (!(Number(before.invoice.total_due) === 250 && before.availableCredit === 0)) {
      return NextResponse.json({
        error: 'The invoice or available credit changed, so nothing was applied or texted.',
        currentInvoiceTotal: Number(before.invoice.total_due),
        availableCredit: before.availableCredit,
      }, { status: 409 })
    }

    const afterCredit = await currentState(admin)
    if (Number(afterCredit.invoice.total_due) !== 250 || afterCredit.availableCredit !== 0) {
      return NextResponse.json({ error: 'The credit result did not verify as a $250 remaining balance. No text was sent.' }, { status: 500 })
    }

    const invoiceUrl = `https://www.buroakscampground.com/invoices/${INVOICE_ID}`
    const message = `Bur Oaks account: $125.00 credit applied to Lot 43. Remaining lot-rent balance: ${money(afterCredit.invoice.total_due)}. It was due Oct 1 and is now past due. Pay: ${invoiceUrl} Reply STOP to opt out.`
    const phones = await consentedCamperSmsPhones(admin, afterCredit.camper)
    const results: any[] = []

    for (const phone of phones) {
      const automationKey = phoneAutomationKey(AUTOMATION_KEY, phone)
      const { data: existing, error: existingError } = await admin
        .from('text_reminders')
        .select('id,status,provider_message_id')
        .eq('invoice_id', INVOICE_ID)
        .eq('automation_key', automationKey)
        .eq('recipient_phone', phone)
        .maybeSingle()
      if (existingError) throw existingError
      if (existing?.status === 'sent') {
        results.push({ phone: maskPhone(phone), status: 'already_sent', providerMessageId: existing.provider_message_id })
        continue
      }

      const { data: reservation, error: reservationError } = await admin.from('text_reminders').insert({
        camper_id: CAMPER_ID,
        invoice_id: INVOICE_ID,
        reminder_type: 'Credit Applied - Past Due Balance',
        message,
        sent_at: new Date().toISOString(),
        status: 'sending',
        recipient_phone: phone,
        provider: 'twilio',
        provider_message_id: null,
        error_message: null,
        sent_by: 'office-request-2026-10-05',
        reminder_date: '2026-10-05',
        automation_key: automationKey,
      }).select('id').single()
      if (reservationError) throw reservationError

      const sent = await sendTwilioSms({ to: phone, body: message, client: admin, camperId: CAMPER_ID })
      await admin.from('text_reminders').update({
        status: sent.sent ? 'sent' : 'failed',
        provider_message_id: sent.sent ? sent.providerMessageId : null,
        error_message: sent.sent ? null : sent.error,
        sent_at: new Date().toISOString(),
      }).eq('id', reservation.id)
      results.push({
        phone: maskPhone(phone),
        status: sent.sent ? 'sent' : 'failed',
        providerMessageId: sent.sent ? sent.providerMessageId : null,
        error: sent.sent ? null : sent.error,
      })
    }

    return NextResponse.json({
      success: results.length > 0 && results.every((result) => ['sent', 'already_sent'].includes(result.status)),
      appliedTotal,
      invoice: { totalDue: Number(afterCredit.invoice.total_due), dueDate: afterCredit.invoice.due_date, lateFee: Number(afterCredit.invoice.late_fee || 0) },
      message,
      results,
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'The credit could not be applied.' }, { status: 500 })
  }
}

export async function GET() {
  const admin = adminClient()
  if (!admin) return NextResponse.json({ error: 'Service key unavailable.' }, { status: 500 })
  try {
    const state = await currentState(admin)
    const reminders = await Promise.all(state.reminders.map(async (reminder: any) => ({
      phone: maskPhone(reminder.recipient_phone),
      databaseStatus: reminder.status,
      sentAt: reminder.sent_at,
      error: reminder.error_message,
      provider: await loadTwilioStatus(String(reminder.provider_message_id || '')),
    })))
    return NextResponse.json({
      camper: { name: `${state.camper.first_name} ${state.camper.last_name}`, lot: state.camper.lot_number },
      invoice: { totalDue: Number(state.invoice.total_due), dueDate: state.invoice.due_date, status: state.invoice.status, lateFee: Number(state.invoice.late_fee || 0) },
      availableCredit: state.availableCredit,
      reminders,
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Audit failed.' }, { status: 500 })
  }
}
