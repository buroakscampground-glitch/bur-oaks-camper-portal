import { NextResponse } from 'next/server'
import { consentedCamperSmsPhones } from '../../../lib/camper-sms'
import { isOperationalCamper } from '../../../lib/camper-records'
import { portalSmsUrl } from '../../../lib/portal-sms-links'
import { checkRateLimit } from '../../../lib/rate-limit'
import { getAuthenticatedContext } from '../../../lib/server-auth'
import { campgroundUpdateSms } from '../../../lib/sms-segments'
import { uniqueSmsBroadcastRecipients, validSmsBroadcastRequestId } from '../../../lib/sms-broadcast'
import { canManageCommunity } from '../../../lib/staff-roles'
import { isTwilioConfigured, sendTwilioSms } from '../../../lib/twilio-sms'

export const runtime = 'nodejs'
export const maxDuration = 300

async function inBatches<T>(items: T[], batchSize: number, work: (item: T) => Promise<void>) {
  for (let index = 0; index < items.length; index += batchSize) {
    await Promise.all(items.slice(index, index + batchSize).map(work))
  }
}

export async function GET(request: Request) {
  const context = await getAuthenticatedContext(request)
  if (!context || !canManageCommunity(context.camper.role)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  const { data, error } = await context.admin
    .from('announcements')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ announcements: data || [] })
}

export async function PATCH(request: Request) {
  const context = await getAuthenticatedContext(request)
  if (!context || !canManageCommunity(context.camper.role)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const id = String(body.id || '')
  if (!id || typeof body.isActive !== 'boolean') {
    return NextResponse.json({ error: 'Choose an announcement and status.' }, { status: 400 })
  }

  const { error } = await context.admin
    .from('announcements')
    .update({ is_active: body.isActive })
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

export async function POST(request: Request) {
  const rateLimit = await checkRateLimit(request, 'admin-announcements', 12, 10 * 60_000)
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many announcements. Please wait and try again.' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfter) } }
    )
  }

  const context = await getAuthenticatedContext(request)
  if (!context || !canManageCommunity(context.camper.role)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const title = String(body.title || '').trim().slice(0, 140)
  const message = String(body.message || '').trim().slice(0, 8000)
  const isUrgent = body.isUrgent === true
  const sendText = body.sendText === true
  const requestId = String(body.requestId || '')

  if (!title || !message) {
    return NextResponse.json({ error: 'Add both a title and the full announcement details.' }, { status: 400 })
  }

  if (!validSmsBroadcastRequestId(requestId)) {
    return NextResponse.json({ error: 'This announcement needs a valid campaign ID. Refresh the page and try again.' }, { status: 400 })
  }

  const { data: announcement, error: insertError } = await context.admin
    .from('announcements')
    .insert({ title, message, is_active: true, is_urgent: isUrgent, request_id: requestId })
    .select('*')
    .single()

  if (insertError?.code === '23505') {
    const [{ data: existingAnnouncement }, { data: existingCampaign }] = await Promise.all([
      context.admin.from('announcements').select('*').eq('request_id', requestId).single(),
      context.admin.from('sms_broadcasts').select('*').eq('idempotency_key', requestId).maybeSingle(),
    ])

    return NextResponse.json({
      success: true,
      duplicateRequest: true,
      announcement: existingAnnouncement || null,
      textStatus: existingCampaign?.status || (sendText ? 'sending' : 'not_requested'),
      smsSentCount: existingCampaign?.sent_count || 0,
      smsFailedCount: existingCampaign?.failed_count || 0,
      smsSkippedCount: existingCampaign?.duplicate_recipient_count || 0,
    })
  }

  if (insertError || !announcement) {
    return NextResponse.json({ error: insertError?.message || 'Unable to post this announcement.' }, { status: 500 })
  }

  if (!sendText) {
    return NextResponse.json({ success: true, announcement, textStatus: 'not_requested' })
  }

  if (!isTwilioConfigured()) {
    return NextResponse.json({
      success: true,
      announcement,
      textStatus: 'skipped',
      textMessage: 'The announcement was posted, but Twilio is not connected.',
      smsSentCount: 0,
      smsFailedCount: 0,
      smsSkippedCount: 0,
    })
  }

  const { data: camperRows, error: camperError } = await context.admin
    .from('campers')
    .select('id,lot_number,phone,alternate_phone,second_profile_phone,sms_opt_in,active,role')
    .eq('active', true)
    .eq('sms_opt_in', true)

  if (camperError) {
    return NextResponse.json({
      success: true,
      announcement,
      textStatus: 'failed',
      textMessage: `The announcement was posted, but recipients could not be loaded: ${camperError.message}`,
      smsSentCount: 0,
      smsFailedCount: 0,
      smsSkippedCount: 0,
    })
  }

  const campers = (camperRows || []).filter(isOperationalCamper)
  const smsBody = campgroundUpdateSms(title, portalSmsUrl('/updates'))
  let smsSentCount = 0
  let smsFailedCount = 0
  let smsSkippedCount = 0
  const reminderRows: any[] = []

  const candidates: Array<{ camper: any; phones: string[] }> = []
  await inBatches(campers, 20, async (camper) => {
    try {
      const phones = await consentedCamperSmsPhones(context.admin, camper)
      if (!phones.length) smsSkippedCount += 1
      candidates.push({ camper, phones })
    } catch {
      smsFailedCount += 1
    }
  })

  const recipientPlan = uniqueSmsBroadcastRecipients(candidates)
  smsSkippedCount += recipientPlan.duplicateCount

  const { data: campaign, error: campaignError } = await context.admin
    .from('sms_broadcasts')
    .insert({
      idempotency_key: requestId,
      target_mode: 'all_opted_in',
      reminder_type: 'Campground Update',
      message: smsBody,
      recipient_count: recipientPlan.recipients.length,
      duplicate_recipient_count: recipientPlan.duplicateCount,
      created_by: context.user.id,
      created_by_email: context.user.email,
    })
    .select('*')
    .single()

  if (campaignError || !campaign) {
    return NextResponse.json({
      success: true,
      announcement,
      textStatus: 'failed',
      textMessage: 'The update was posted, but duplicate-safe text delivery could not be started.',
      smsSentCount: 0,
      smsFailedCount: recipientPlan.recipients.length,
      smsSkippedCount,
    })
  }

  await inBatches(recipientPlan.recipients, 10, async ({ camper, phone }) => {
      const { data: reservation, error: reservationError } = await context.admin
        .from('sms_broadcast_deliveries')
        .insert({ broadcast_id: campaign.id, camper_id: camper.id, recipient_phone: phone })
        .select('id')
        .single()

      if (reservationError || !reservation) {
        smsFailedCount += 1
        return
      }

      const result = await sendTwilioSms({
        to: phone,
        body: smsBody,
        client: context.admin,
        camperId: camper.id,
      })
      if (result.sent) smsSentCount += 1
      else smsFailedCount += 1

      await context.admin.from('sms_broadcast_deliveries').update({
        status: result.sent ? 'sent' : 'failed',
        provider_message_id: result.sent ? result.providerMessageId : null,
        error_message: result.sent ? null : result.error,
        completed_at: new Date().toISOString(),
      }).eq('id', reservation.id)

      reminderRows.push({
        camper_id: camper.id,
        invoice_id: null,
        reminder_type: 'Campground Update',
        message: smsBody,
        sent_at: new Date().toISOString(),
        status: result.sent ? 'sent' : 'failed',
        recipient_phone: phone,
        provider: 'twilio',
        provider_message_id: result.sent ? result.providerMessageId : null,
        error_message: result.sent ? null : result.error,
        sent_by: context.user.email || 'Bur Oaks Admin',
        broadcast_id: campaign.id,
      })
  })

  if (reminderRows.length) {
    await context.admin.from('text_reminders').insert(reminderRows)
  }

  await context.admin.from('sms_broadcasts').update({
    status: smsFailedCount === 0 ? 'sent' : smsSentCount > 0 ? 'partial' : 'failed',
    sent_count: smsSentCount,
    failed_count: smsFailedCount,
    completed_at: new Date().toISOString(),
  }).eq('id', campaign.id)

  return NextResponse.json({
    success: true,
    announcement,
    textStatus: smsSentCount > 0 ? 'sent' : smsFailedCount > 0 ? 'failed' : 'skipped',
    smsSentCount,
    smsFailedCount,
    smsSkippedCount,
    duplicateRecipientCount: recipientPlan.duplicateCount,
    campaignId: campaign.id,
    textMessage: smsBody,
  })
}
