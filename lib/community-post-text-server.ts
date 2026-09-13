import { isOperationalCamper } from './camper-records'
import { consentedCamperSmsPhones } from './camper-sms'
import { portalSmsUrl } from './portal-sms-links'
import { uniqueSmsBroadcastRecipients } from './sms-broadcast'
import { communityPostSms } from './sms-segments'
import { isTwilioConfigured, sendTwilioSms } from './twilio-sms'

async function inBatches<T>(items: T[], batchSize: number, work: (item: T) => Promise<void>) {
  for (let index = 0; index < items.length; index += batchSize) {
    await Promise.all(items.slice(index, index + batchSize).map(work))
  }
}

export async function textCampersAboutStaffPost({
  admin,
  user,
  post,
  author,
}: {
  admin: any
  user: any
  post: any
  author: string
}) {
  if (!isTwilioConfigured()) return { status: 'skipped', sentCount: 0, failedCount: 0, reason: 'Twilio is not configured.' }

  const { data: camperRows, error: camperError } = await admin
    .from('campers')
    .select('id,lot_number,phone,alternate_phone,second_profile_phone,sms_opt_in,active,role')
    .eq('active', true)
    .eq('sms_opt_in', true)
  if (camperError) throw camperError

  const candidates: Array<{ camper: any; phones: string[] }> = []
  await inBatches((camperRows || []).filter(isOperationalCamper), 20, async (camper: any) => {
    try {
      candidates.push({ camper, phones: await consentedCamperSmsPhones(admin, camper) })
    } catch (error: any) {
      console.error(`Community post text consent could not be checked for camper ${camper.id}:`, error?.message || error)
    }
  })

  const recipientPlan = uniqueSmsBroadcastRecipients(candidates)
  if (!recipientPlan.recipients.length) return { status: 'skipped', sentCount: 0, failedCount: 0, reason: 'No opted-in phone numbers matched.' }

  const message = communityPostSms(author, portalSmsUrl('/campground-community'))
  const { data: campaign, error: campaignError } = await admin.from('sms_broadcasts').insert({
    idempotency_key: post.id,
    target_mode: 'all_opted_in',
    reminder_type: 'Community Post',
    message,
    recipient_count: recipientPlan.recipients.length,
    duplicate_recipient_count: recipientPlan.duplicateCount,
    created_by: user.id || null,
    created_by_email: user.email || null,
  }).select('*').single()

  // The post ID is the campaign key, so a retried request can never send the
  // same Community alert twice.
  if (campaignError?.code === '23505') {
    const { data: existing } = await admin.from('sms_broadcasts').select('status,sent_count,failed_count').eq('idempotency_key', post.id).maybeSingle()
    return { status: existing?.status || 'duplicate', sentCount: Number(existing?.sent_count || 0), failedCount: Number(existing?.failed_count || 0), duplicate: true }
  }
  if (campaignError || !campaign) throw campaignError || new Error('Community post text campaign could not be reserved.')

  let sentCount = 0
  let failedCount = 0
  await inBatches(recipientPlan.recipients, 10, async ({ camper, phone }) => {
    const { data: reservation, error: reservationError } = await admin.from('sms_broadcast_deliveries').insert({
      broadcast_id: campaign.id,
      camper_id: camper.id,
      recipient_phone: phone,
    }).select('id').single()
    if (reservationError || !reservation) {
      failedCount += 1
      return
    }

    const result = await sendTwilioSms({ to: phone, body: message, client: admin, camperId: camper.id })
    if (result.sent) sentCount += 1
    else failedCount += 1

    await admin.from('sms_broadcast_deliveries').update({
      status: result.sent ? 'sent' : 'failed',
      provider_message_id: result.sent ? result.providerMessageId : null,
      error_message: result.sent ? null : result.error,
      completed_at: new Date().toISOString(),
    }).eq('id', reservation.id)

    await admin.from('text_reminders').insert({
      camper_id: camper.id,
      invoice_id: null,
      reminder_type: 'Community Post',
      message,
      sent_at: new Date().toISOString(),
      status: result.sent ? 'sent' : 'failed',
      recipient_phone: phone,
      provider: 'twilio',
      provider_message_id: result.sent ? result.providerMessageId : null,
      error_message: result.sent ? null : result.error,
      sent_by: user.email || 'Bur Oaks Community',
      broadcast_id: campaign.id,
    })
  })

  const status = failedCount === 0 ? 'sent' : sentCount > 0 ? 'partial' : 'failed'
  await admin.from('sms_broadcasts').update({
    status,
    sent_count: sentCount,
    failed_count: failedCount,
    completed_at: new Date().toISOString(),
  }).eq('id', campaign.id)

  return { status, sentCount, failedCount, recipientCount: recipientPlan.recipients.length, duplicateRecipientCount: recipientPlan.duplicateCount }
}
