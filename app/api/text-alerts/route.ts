import { NextResponse } from 'next/server'
import { getAuthenticatedContext } from '../../../lib/server-auth'
import { formatSmsPhone, isTwilioConfigured, sendTwilioSms } from '../../../lib/twilio-sms'

function camperName(camper: any) {
  return `${camper.first_name || ''} ${camper.last_name || ''}`.trim() || 'Camper'
}

function buildTextMessage(message: string) {
  const trimmed = message.trim()
  return `Bur Oaks Campground: ${trimmed}\nReply STOP to opt out.`
}

async function requireAdmin(request: Request) {
  const context = await getAuthenticatedContext(request)

  if (!context || String(context.camper.role || '').toLowerCase() !== 'admin') {
    return null
  }

  return context
}

export async function GET(request: Request) {
  const context = await requireAdmin(request)
  if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  return NextResponse.json({
    success: true,
    twilioConfigured: isTwilioConfigured(),
  })
}

export async function POST(request: Request) {
  const context = await requireAdmin(request)
  if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const targetMode = String(body.targetMode || 'all_opted_in')
  const camperId = String(body.camperId || '')
  const reminderType = String(body.reminderType || 'General Alert').slice(0, 80)
  const message = String(body.message || '').trim().slice(0, 1200)

  if (!message) {
    return NextResponse.json({ error: 'Type a text message first.' }, { status: 400 })
  }

  if (!isTwilioConfigured()) {
    return NextResponse.json(
      { error: 'Twilio is not connected yet. Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER in Vercel.' },
      { status: 400 }
    )
  }

  let camperQuery = context.admin
    .from('campers')
    .select('id,lot_number,first_name,last_name,phone,sms_opt_in,active')
    .eq('active', true)
    .eq('sms_opt_in', true)
    .not('phone', 'is', null)
    .order('lot_number', { ascending: true })

  if (targetMode === 'one') {
    if (!camperId) {
      return NextResponse.json({ error: 'Choose a camper first.' }, { status: 400 })
    }
    camperQuery = camperQuery.eq('id', camperId)
  }

  const { data: campers, error: camperError } = await camperQuery
  if (camperError) return NextResponse.json({ error: camperError.message }, { status: 500 })

  let targetCampers = campers || []

  if (targetMode === 'open_balance') {
    const { data: invoices, error: invoiceError } = await context.admin
      .from('invoices')
      .select('camper_id,status,total_due')
      .neq('status', 'paid')
      .gt('total_due', 0)

    if (invoiceError) return NextResponse.json({ error: invoiceError.message }, { status: 500 })

    const camperIdsWithBalance = new Set((invoices || []).map((invoice: any) => String(invoice.camper_id)))
    targetCampers = targetCampers.filter((camper: any) => camperIdsWithBalance.has(String(camper.id)))
  }

  if (targetCampers.length === 0) {
    return NextResponse.json(
      { error: 'No opted-in campers with phone numbers matched this text.' },
      { status: 400 }
    )
  }

  const finalMessage = buildTextMessage(message)
  const results: any[] = []

  for (const camper of targetCampers) {
    const phone = formatSmsPhone(camper.phone)
    const result: { sent: boolean; providerMessageId?: string; error?: string } = phone
      ? await sendTwilioSms({ to: phone, body: finalMessage })
      : { sent: false, error: 'No valid mobile number is saved for this camper.' }

    const logRow = {
      camper_id: camper.id,
      invoice_id: null,
      reminder_type: reminderType,
      message,
      sent_at: new Date().toISOString(),
      status: result.sent ? 'sent' : 'failed',
      recipient_phone: phone || camper.phone || null,
      provider: 'twilio',
      provider_message_id: result.sent ? result.providerMessageId : null,
      error_message: result.sent ? null : result.error,
      sent_by: context.user.email,
    }

    await context.admin.from('text_reminders').insert(logRow)

    results.push({
      camperId: camper.id,
      lotNumber: camper.lot_number,
      camperName: camperName(camper),
      phone,
      status: result.sent ? 'sent' : 'failed',
      error: result.sent ? null : result.error,
    })
  }

  const sentCount = results.filter((result) => result.status === 'sent').length
  const failedCount = results.length - sentCount

  return NextResponse.json({
    success: sentCount > 0,
    sentCount,
    failedCount,
    results,
  })
}
