import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { isOperationalCamper } from '../../../../lib/camper-records'
import { consentedCamperSmsPhones } from '../../../../lib/camper-sms'
import { camperTextWithLink } from '../../../../lib/portal-sms-links'
import { uniqueSmsBroadcastRecipients } from '../../../../lib/sms-broadcast'
import { isTwilioConfigured, sendTwilioSms } from '../../../../lib/twilio-sms'

export const dynamic = 'force-dynamic'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mzywctpxnpejglnspyqi.supabase.co'

const reminders = {
  '2026-09-04-20': {
    requestId: '7a19b02a-1bf3-4ce3-93f3-6ef6d3b54001',
    message: 'Breakfast is tomorrow at 9:00 AM. Come hungry - we look forward to seeing you!',
  },
  '2026-09-05-08': {
    requestId: '7a19b02a-1bf3-4ce3-93f3-6ef6d3b54002',
    message: 'Good morning! Breakfast starts at 9:00 AM today. See you soon!',
  },
} as const

function centralRunKey() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date())
  const value = (type: string) => parts.find((part) => part.type === type)?.value || ''
  return `${value('year')}-${value('month')}-${value('day')}-${value('hour')}`
}

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET
  return Boolean(secret && request.headers.get('authorization') === `Bearer ${secret}`)
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })

  const runKey = centralRunKey()
  const reminder = reminders[runKey as keyof typeof reminders]
  if (!reminder) {
    return NextResponse.json({ success: true, skipped: true, reason: 'Outside the scheduled breakfast reminder windows.', runKey })
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !isTwilioConfigured()) {
    return NextResponse.json({ error: 'The text reminder service is not configured.' }, { status: 500 })
  }

  const admin = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY)
  const { data: existing } = await admin
    .from('sms_broadcasts')
    .select('id,status,sent_count,failed_count,recipient_count')
    .eq('idempotency_key', reminder.requestId)
    .maybeSingle()
  if (existing) {
    return NextResponse.json({ success: true, duplicateRequest: true, runKey, ...existing })
  }

  const { data: campers, error: camperError } = await admin
    .from('campers')
    .select('id,lot_number,first_name,last_name,phone,alternate_phone,second_profile_phone,sms_opt_in,active,role')
    .eq('active', true)
    .eq('sms_opt_in', true)
    .order('lot_number', { ascending: true })
  if (camperError) return NextResponse.json({ error: camperError.message }, { status: 500 })

  const candidates = []
  for (const camper of (campers || []).filter(isOperationalCamper)) {
    candidates.push({ camper, phones: await consentedCamperSmsPhones(admin, camper) })
  }
  const recipientPlan = uniqueSmsBroadcastRecipients(candidates)
  if (!recipientPlan.recipients.length) {
    return NextResponse.json({ error: 'No opted-in phone numbers matched this reminder.' }, { status: 400 })
  }

  const finalMessage = camperTextWithLink({ message: reminder.message, path: '/calendar', compact: true })
  const { data: campaign, error: campaignError } = await admin
    .from('sms_broadcasts')
    .insert({
      idempotency_key: reminder.requestId,
      target_mode: 'all_opted_in',
      reminder_type: 'Breakfast Reminder',
      message: finalMessage,
      recipient_count: recipientPlan.recipients.length,
      duplicate_recipient_count: recipientPlan.duplicateCount,
      created_by_email: 'automatic-breakfast-reminder',
    })
    .select('id')
    .single()
  if (campaignError || !campaign) {
    return NextResponse.json({ error: campaignError?.message || 'Unable to reserve the reminder.' }, { status: 500 })
  }

  let sentCount = 0
  let failedCount = 0
  for (let index = 0; index < recipientPlan.recipients.length; index += 5) {
    const batch = recipientPlan.recipients.slice(index, index + 5)
    const results = await Promise.all(batch.map(async (recipient) => {
      const { data: delivery, error: deliveryError } = await admin
        .from('sms_broadcast_deliveries')
        .insert({ broadcast_id: campaign.id, camper_id: recipient.camper.id, recipient_phone: recipient.phone })
        .select('id')
        .single()
      if (deliveryError || !delivery) return false

      const result = await sendTwilioSms({
        to: recipient.phone,
        body: finalMessage,
        client: admin,
        camperId: recipient.camper.id,
      })
      await Promise.all([
        admin.from('sms_broadcast_deliveries').update({
          status: result.sent ? 'sent' : 'failed',
          provider_message_id: result.sent ? result.providerMessageId : null,
          error_message: result.sent ? null : result.error,
          completed_at: new Date().toISOString(),
        }).eq('id', delivery.id),
        admin.from('text_reminders').insert({
          camper_id: recipient.camper.id,
          invoice_id: null,
          reminder_type: 'Breakfast Reminder',
          message: finalMessage,
          sent_at: new Date().toISOString(),
          status: result.sent ? 'sent' : 'failed',
          recipient_phone: recipient.phone,
          provider: 'twilio',
          provider_message_id: result.sent ? result.providerMessageId : null,
          error_message: result.sent ? null : result.error,
          sent_by: 'automatic-breakfast-reminder',
          broadcast_id: campaign.id,
        }),
      ])
      return result.sent
    }))
    sentCount += results.filter(Boolean).length
    failedCount += results.filter((sent) => !sent).length
  }

  await admin.from('sms_broadcasts').update({
    status: failedCount === 0 ? 'sent' : sentCount > 0 ? 'partial' : 'failed',
    sent_count: sentCount,
    failed_count: failedCount,
    completed_at: new Date().toISOString(),
  }).eq('id', campaign.id)

  return NextResponse.json({ success: sentCount > 0, runKey, sentCount, failedCount, recipientCount: recipientPlan.recipients.length })
}
