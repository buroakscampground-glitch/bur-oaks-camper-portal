import { NextResponse } from 'next/server'
import { consentedCamperSmsPhones } from '../../../lib/camper-sms'
import { isOperationalCamper } from '../../../lib/camper-records'
import { portalSmsUrl } from '../../../lib/portal-sms-links'
import { checkRateLimit } from '../../../lib/rate-limit'
import { getAuthenticatedContext } from '../../../lib/server-auth'
import { campgroundUpdateSms } from '../../../lib/sms-segments'
import { isTwilioConfigured, sendTwilioSms } from '../../../lib/twilio-sms'

export const runtime = 'nodejs'
export const maxDuration = 300

async function inBatches<T>(items: T[], batchSize: number, work: (item: T) => Promise<void>) {
  for (let index = 0; index < items.length; index += batchSize) {
    await Promise.all(items.slice(index, index + batchSize).map(work))
  }
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
  if (!context || String(context.camper.role || '').toLowerCase() !== 'admin') {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const title = String(body.title || '').trim().slice(0, 140)
  const message = String(body.message || '').trim().slice(0, 8000)
  const isUrgent = body.isUrgent === true
  const sendText = body.sendText === true

  if (!title || !message) {
    return NextResponse.json({ error: 'Add both a title and the full announcement details.' }, { status: 400 })
  }

  const { data: announcement, error: insertError } = await context.admin
    .from('announcements')
    .insert({ title, message, is_active: true, is_urgent: isUrgent })
    .select('*')
    .single()

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

  const recipients: Array<{ camper: any; phone: string }> = []
  await inBatches(campers, 20, async (camper) => {
    try {
      const phones = await consentedCamperSmsPhones(context.admin, camper)
      if (!phones.length) smsSkippedCount += 1
      else phones.forEach((phone) => recipients.push({ camper, phone }))
    } catch {
      smsFailedCount += 1
    }
  })

  await inBatches(recipients, 10, async ({ camper, phone }) => {
      const result = await sendTwilioSms({ to: phone, body: smsBody })
      if (result.sent) smsSentCount += 1
      else smsFailedCount += 1

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
      })
  })

  if (reminderRows.length) {
    await context.admin.from('text_reminders').insert(reminderRows)
  }

  return NextResponse.json({
    success: true,
    announcement,
    textStatus: smsSentCount > 0 ? 'sent' : smsFailedCount > 0 ? 'failed' : 'skipped',
    smsSentCount,
    smsFailedCount,
    smsSkippedCount,
    textMessage: smsBody,
  })
}
