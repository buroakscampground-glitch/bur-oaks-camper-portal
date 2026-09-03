import { NextResponse } from 'next/server'
import { getAuthenticatedContext } from '../../../lib/server-auth'
import { isOperationalCamper } from '../../../lib/camper-records'
import { isTwilioConfigured, sendTwilioSms } from '../../../lib/twilio-sms'
import { camperTextWithLink, portalPathForTextType } from '../../../lib/portal-sms-links'
import { consentedCamperSmsPhones } from '../../../lib/camper-sms'
import {
  maskSmsPhone,
  uniqueSmsBroadcastRecipients,
  validSmsBroadcastRequestId,
} from '../../../lib/sms-broadcast'

function camperName(camper: any) {
  return `${camper.first_name || ''} ${camper.last_name || ''}`.trim() || 'Camper'
}

function buildTextMessage(message: string, reminderType: string) {
  return camperTextWithLink({
    message,
    path: portalPathForTextType(reminderType),
    compact: true,
  })
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
  const requestId = String(body.requestId || '')

  if (!message) {
    return NextResponse.json({ error: 'Type a text message first.' }, { status: 400 })
  }

  if (!validSmsBroadcastRequestId(requestId)) {
    return NextResponse.json({ error: 'This text needs a valid campaign ID. Refresh the page and try again.' }, { status: 400 })
  }

  if (!isTwilioConfigured()) {
    return NextResponse.json(
      { error: 'Twilio is not connected yet. Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER in Vercel.' },
      { status: 400 }
    )
  }

  let camperQuery = context.admin
    .from('campers')
    .select('id,lot_number,first_name,last_name,phone,alternate_phone,second_profile_phone,sms_opt_in,active,role')
    .eq('active', true)
    .eq('sms_opt_in', true)
    .order('lot_number', { ascending: true })

  if (targetMode === 'one') {
    if (!camperId) {
      return NextResponse.json({ error: 'Choose a camper first.' }, { status: 400 })
    }
    camperQuery = camperQuery.eq('id', camperId)
  }

  const { data: campers, error: camperError } = await camperQuery
  if (camperError) return NextResponse.json({ error: camperError.message }, { status: 500 })

  let targetCampers = (campers || []).filter(isOperationalCamper)

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

  const candidates = []
  for (const camper of targetCampers) {
    const phones = await consentedCamperSmsPhones(context.admin, camper)
    candidates.push({ camper, phones })
  }

  const recipientPlan = uniqueSmsBroadcastRecipients(candidates)
  if (!recipientPlan.recipients.length) {
    return NextResponse.json({ error: 'No opted-in phone numbers matched this text.' }, { status: 400 })
  }

  const finalMessage = buildTextMessage(message, reminderType)
  const campaignInsert = await context.admin
    .from('sms_broadcasts')
    .insert({
      idempotency_key: requestId,
      target_mode: targetMode,
      target_camper_id: targetMode === 'one' ? camperId : null,
      reminder_type: reminderType,
      message: finalMessage,
      recipient_count: recipientPlan.recipients.length,
      duplicate_recipient_count: recipientPlan.duplicateCount,
      created_by: context.user.id,
      created_by_email: context.user.email,
    })
    .select('*')
    .single()

  if (campaignInsert.error?.code === '23505') {
    const { data: existing } = await context.admin
      .from('sms_broadcasts')
      .select('*')
      .eq('idempotency_key', requestId)
      .single()

    return NextResponse.json({
      success: true,
      duplicateRequest: true,
      campaignId: existing?.id || null,
      campaignStatus: existing?.status || 'sending',
      sentCount: existing?.sent_count || 0,
      failedCount: existing?.failed_count || 0,
      recipientCount: existing?.recipient_count || recipientPlan.recipients.length,
      duplicateRecipientCount: existing?.duplicate_recipient_count || recipientPlan.duplicateCount,
      results: [],
    })
  }

  if (campaignInsert.error || !campaignInsert.data) {
    const missingMigration = ['42P01', 'PGRST205'].includes(campaignInsert.error?.code || '')
    return NextResponse.json(
      { error: missingMigration ? 'Text duplicate protection is not installed yet.' : campaignInsert.error?.message || 'Unable to reserve this text campaign.' },
      { status: 503 }
    )
  }

  const campaign = campaignInsert.data
  const results: any[] = []

  for (const recipient of recipientPlan.recipients) {
    const camper = recipient.camper
    const phone = recipient.phone
    const reservation = await context.admin.from('sms_broadcast_deliveries').insert({
      broadcast_id: campaign.id,
      camper_id: camper.id,
      recipient_phone: phone,
    }).select('id').single()

    if (reservation.error || !reservation.data) continue

    const result = await sendTwilioSms({ to: phone, body: finalMessage })

    await context.admin.from('sms_broadcast_deliveries').update({
      status: result.sent ? 'sent' : 'failed',
      provider_message_id: result.sent ? result.providerMessageId : null,
      error_message: result.sent ? null : result.error,
      completed_at: new Date().toISOString(),
    }).eq('id', reservation.data.id)

    await context.admin.from('text_reminders').insert({
      camper_id: camper.id,
      invoice_id: null,
      reminder_type: reminderType,
      message: finalMessage,
      sent_at: new Date().toISOString(),
      status: result.sent ? 'sent' : 'failed',
      recipient_phone: phone,
      provider: 'twilio',
      provider_message_id: result.sent ? result.providerMessageId : null,
      error_message: result.sent ? null : result.error,
      sent_by: context.user.email,
      broadcast_id: campaign.id,
    })

    results.push({
      camperId: camper.id,
      lotNumber: camper.lot_number,
      camperName: camperName(camper),
      phone: maskSmsPhone(phone),
      status: result.sent ? 'sent' : 'failed',
      providerMessageId: result.sent ? result.providerMessageId : null,
      error: result.sent ? null : result.error,
    })
  }

  const sentCount = results.filter((result) => result.status === 'sent').length
  const failedCount = results.length - sentCount

  await context.admin.from('sms_broadcasts').update({
    status: failedCount === 0 ? 'sent' : sentCount > 0 ? 'partial' : 'failed',
    sent_count: sentCount,
    failed_count: failedCount,
    completed_at: new Date().toISOString(),
  }).eq('id', campaign.id)

  return NextResponse.json({
    success: sentCount > 0,
    sentCount,
    failedCount,
    campaignId: campaign.id,
    recipientCount: recipientPlan.recipients.length,
    duplicateRecipientCount: recipientPlan.duplicateCount,
    finalMessage,
    results,
  })
}
