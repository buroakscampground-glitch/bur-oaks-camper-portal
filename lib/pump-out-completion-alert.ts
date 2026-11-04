import type { SupabaseClient } from '@supabase/supabase-js'
import type { AuthCamperRecord } from './auth-account-match.ts'
import { consentedCamperSmsPhones, phoneAutomationKey } from './camper-sms.ts'
import { pumpOutCompletionSms } from './pump-out-completion-copy.ts'
import { isTwilioConfigured, sendTwilioSms } from './twilio-sms.ts'

export type PumpOutCompletionTextSummary = {
  status: 'sent' | 'skipped' | 'failed'
  sentCount: number
  failedCount: number
  skippedCount: number
  detail: string
}

export async function sendPumpOutCompletionText({
  client,
  camperId,
  requestId,
  lotNumber,
  sentBy,
}: {
  client: SupabaseClient
  camperId: string
  requestId: string
  lotNumber: string | null | undefined
  sentBy: string
}): Promise<PumpOutCompletionTextSummary> {
  const { data, error } = await client
    .from('campers')
    .select('id,phone,alternate_phone,second_profile_phone,sms_opt_in')
    .eq('id', camperId)
    .maybeSingle()

  if (error || !data) {
    return { status: 'failed', sentCount: 0, failedCount: 1, skippedCount: 0, detail: 'The camper contact record could not be loaded.' }
  }

  const camper = data as AuthCamperRecord
  if (!camper.sms_opt_in) {
    return { status: 'skipped', sentCount: 0, failedCount: 0, skippedCount: 1, detail: 'The camper has not opted into text alerts.' }
  }
  if (!isTwilioConfigured()) {
    return { status: 'skipped', sentCount: 0, failedCount: 0, skippedCount: 1, detail: 'Text delivery is not configured.' }
  }

  let phones: string[] = []
  try {
    phones = await consentedCamperSmsPhones(client, camper)
  } catch {
    return { status: 'failed', sentCount: 0, failedCount: 1, skippedCount: 0, detail: 'Text consent could not be verified.' }
  }
  if (!phones.length) {
    return { status: 'skipped', sentCount: 0, failedCount: 0, skippedCount: 1, detail: 'No consented mobile number is saved.' }
  }

  const message = pumpOutCompletionSms(lotNumber)
  let sentCount = 0
  let failedCount = 0
  let skippedCount = 0

  for (const phone of phones) {
    const automationKey = phoneAutomationKey(`pump-out-complete-${requestId}`, phone)
    const { data: reservation, error: reservationError } = await client
      .from('text_reminders')
      .insert({
        camper_id: camperId,
        invoice_id: null,
        reminder_type: 'Pump-Out Complete',
        message,
        sent_at: new Date().toISOString(),
        status: 'sending',
        recipient_phone: phone,
        provider: 'twilio',
        provider_message_id: null,
        error_message: null,
        sent_by: sentBy,
        automation_key: automationKey,
      })
      .select('id')
      .single()

    if (reservationError?.code === '23505') {
      skippedCount += 1
      continue
    }
    if (reservationError || !reservation?.id) {
      failedCount += 1
      continue
    }

    const result = await sendTwilioSms({ to: phone, body: message, client, camperId })
    await client.from('text_reminders').update({
      status: result.sent ? 'sent' : 'failed',
      provider_message_id: result.sent ? result.providerMessageId : null,
      error_message: result.sent ? null : result.error,
    }).eq('id', reservation.id)

    if (result.sent) sentCount += 1
    else failedCount += 1
  }

  if (sentCount > 0) {
    return {
      status: 'sent',
      sentCount,
      failedCount,
      skippedCount,
      detail: failedCount ? 'The portal alert was saved, but one saved phone number could not receive the text.' : 'Camper portal alert and text sent.',
    }
  }
  if (failedCount > 0) {
    return { status: 'failed', sentCount, failedCount, skippedCount, detail: 'The portal alert was saved, but the text could not be delivered.' }
  }
  return { status: 'skipped', sentCount, failedCount, skippedCount, detail: 'This completion text was already reserved or sent.' }
}
