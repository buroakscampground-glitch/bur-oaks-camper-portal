import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { consentedCamperSmsPhones } from '../../../lib/camper-sms'
import { isOperationalCamper } from '../../../lib/camper-records'
import { isTwilioConfigured, sendTwilioSms } from '../../../lib/twilio-sms'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const ONE_TIME_KEY = 'e8d159211f3c487495a0d3180057ccad'
const REMINDER_TYPE = 'Pork Steak Announcement 2026-09-06 3 PM'
const MESSAGE = 'Bur Oaks: Pork steaks will be ready at 3:00 PM today — $10 per plate!\n\nA huge thank-you to Chad Boyd and Dave Weihaupt for cooking. These chefs have been slaving away all weekend for us! Thank you, Chad and Dave!'

function authorized(request: Request) {
  return request.headers.get('x-one-time-key') === ONE_TIME_KEY
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: 'Not found.' }, { status: 404 })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return NextResponse.json({ error: 'Production database is not configured.' }, { status: 500 })
  if (!isTwilioConfigured()) return NextResponse.json({ error: 'Twilio is not configured.' }, { status: 500 })

  const admin = createClient(url, key)

  try {
    const [{ data: campers, error: camperError }, { data: prior, error: priorError }] = await Promise.all([
      admin
        .from('campers')
        .select('id,lot_number,first_name,last_name,phone,alternate_phone,second_profile_phone,sms_opt_in,active,role')
        .eq('active', true)
        .eq('sms_opt_in', true)
        .order('lot_number', { ascending: true }),
      admin
        .from('text_reminders')
        .select('recipient_phone,status')
        .eq('reminder_type', REMINDER_TYPE)
        .eq('status', 'sent'),
    ])

    if (camperError || priorError) throw new Error(camperError?.message || priorError?.message)

    const alreadySent = new Set((prior || []).map((row: any) => String(row.recipient_phone || '')))
    const encounteredPhones = new Set<string>()
    const results: Array<{ lotNumber: string; phoneEnding: string; status: string; error: string | null }> = []

    for (const camper of (campers || []).filter(isOperationalCamper)) {
      const phones = await consentedCamperSmsPhones(admin, camper)

      for (const phone of phones) {
        if (encounteredPhones.has(phone) || alreadySent.has(phone)) continue
        encounteredPhones.add(phone)

        const result = await sendTwilioSms({ to: phone, body: MESSAGE, client: admin, camperId: camper.id })
        await admin.from('text_reminders').insert({
          camper_id: camper.id,
          invoice_id: null,
          reminder_type: REMINDER_TYPE,
          message: MESSAGE,
          sent_at: new Date().toISOString(),
          status: result.sent ? 'sent' : 'failed',
          recipient_phone: phone,
          provider: 'twilio',
          provider_message_id: result.sent ? result.providerMessageId : null,
          error_message: result.sent ? null : result.error,
          sent_by: 'one-time-pork-steak-alert-2026-09-06',
        })

        results.push({
          lotNumber: String(camper.lot_number || ''),
          phoneEnding: phone.slice(-4),
          status: result.sent ? 'sent' : 'failed',
          error: result.sent ? null : result.error,
        })
      }
    }

    const sent = results.filter((result) => result.status === 'sent')
    const failed = results.filter((result) => result.status === 'failed')
    return NextResponse.json({
      success: sent.length > 0 || alreadySent.size > 0,
      sentCount: sent.length,
      failedCount: failed.length,
      siteCount: new Set(sent.map((result) => result.lotNumber)).size,
      alreadySentCount: alreadySent.size,
      failed,
      message: MESSAGE,
    })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Unable to send the pork steak announcement.' }, { status: 500 })
  }
}
