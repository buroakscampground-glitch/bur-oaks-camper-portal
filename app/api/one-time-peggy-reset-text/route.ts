import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { consentedCamperSmsPhones } from '../../../lib/camper-sms'
import { getSiteUrl } from '../../../lib/site-url'
import { sendTwilioSms } from '../../../lib/twilio-sms'

export const runtime = 'nodejs'

const ONE_TIME_KEY = '1234bb7584cb453bf761354be0cca4f61acf6ab4aec1ac45'
const EMAIL = 'peggybartz@sbcglobal.net'
const PHONE = '+16187896840'
const MARKER = 'Peggy private password reset · 2026-08-28'

export async function POST(request: Request) {
  if (request.headers.get('x-one-time-key') !== ONE_TIME_KEY) return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return NextResponse.json({ error: 'Production database is not configured.' }, { status: 500 })
  const admin = createClient(url, serviceKey)

  const { data: alreadySent } = await admin
    .from('text_reminders')
    .select('id,provider_message_id')
    .eq('reminder_type', MARKER)
    .eq('recipient_phone', PHONE)
    .eq('status', 'sent')
    .limit(1)
  if (alreadySent?.length) {
    return NextResponse.json({ success: true, alreadySent: true, providerMessageId: alreadySent[0].provider_message_id })
  }

  const [{ data: primary }, { data: secondary }] = await Promise.all([
    admin
      .from('campers')
      .select('id,phone,alternate_phone,second_profile_phone,sms_opt_in,active')
      .ilike('email', EMAIL),
    admin
      .from('campers')
      .select('id,phone,alternate_phone,second_profile_phone,sms_opt_in,active')
      .ilike('secondary_email', EMAIL),
  ])
  const camper = [...(primary || []), ...(secondary || [])].find((row) => row.active !== false)
  if (!camper) return NextResponse.json({ error: 'No active Peggy Bartz camper record was found.' }, { status: 404 })

  const consentedPhones = await consentedCamperSmsPhones(admin, camper)
  if (!consentedPhones.includes(PHONE)) {
    return NextResponse.json({ error: 'That phone is not an opted-in number on Peggy’s camper profile.' }, { status: 409 })
  }

  const linkResult = await admin.auth.admin.generateLink({
    type: 'recovery',
    email: EMAIL,
    options: { redirectTo: `${getSiteUrl()}/set-password` },
  })
  const tokenHash = linkResult.data?.properties?.hashed_token
  const verificationType = linkResult.data?.properties?.verification_type
  if (linkResult.error || !tokenHash || !verificationType) {
    return NextResponse.json({ error: linkResult.error?.message || 'Unable to create the reset link.' }, { status: 500 })
  }

  const resetUrl = `${getSiteUrl()}/set-password?token_hash=${encodeURIComponent(tokenHash)}&type=${encodeURIComponent(verificationType)}`
  const message = `Bur Oaks Campground: Peggy, tap this private link to create a new portal password: ${resetUrl}\nUse at least 10 characters and do not forward this link. Reply STOP to opt out.`
  const result = await sendTwilioSms({ to: PHONE, body: message })

  await admin.from('text_reminders').insert({
    camper_id: camper.id,
    invoice_id: null,
    reminder_type: MARKER,
    message,
    sent_at: new Date().toISOString(),
    status: result.sent ? 'sent' : 'failed',
    recipient_phone: PHONE,
    provider: 'twilio',
    provider_message_id: result.sent ? result.providerMessageId : null,
    error_message: result.sent ? null : result.error,
    sent_by: 'authorized remote admin action',
  })

  if (!result.sent) return NextResponse.json({ error: result.error }, { status: 502 })
  return NextResponse.json({ success: true, alreadySent: false, providerMessageId: result.providerMessageId })
}
