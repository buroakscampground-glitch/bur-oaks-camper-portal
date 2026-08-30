import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getSiteUrl } from '../../../lib/site-url'
import { formatSmsPhone, isTwilioConfigured, sendTwilioSms } from '../../../lib/twilio-sms'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ONE_TIME_KEY = '51d4971104383060392be92dff76c67dea633db909619581'
const TARGET_PHONE = '+13143688218'
const MARKER = 'Frank Hirat Portal Setup Text 2026-08-29'

function authorized(request: Request) {
  return request.headers.get('x-one-time-key') === ONE_TIME_KEY
}

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  return url && key ? createClient(url, key) : null
}

function clean(value: unknown) {
  return String(value || '').trim().toLowerCase()
}

async function findFrank(admin: any) {
  const { data, error } = await admin
    .from('campers')
    .select('id,first_name,last_name,second_profile_first_name,second_profile_last_name,lot_number,email,secondary_email,active,role')
    .eq('active', true)
    .or('first_name.ilike.Frank,second_profile_first_name.ilike.Frank')

  if (error) throw new Error(error.message)

  const candidates = (data || []).filter((row: any) => !['admin', 'maintenance'].includes(clean(row.role)))
  const exact = candidates.filter((row: any) => (
    (clean(row.first_name) === 'frank' && ['hirat', 'horat'].includes(clean(row.last_name))) ||
    (clean(row.second_profile_first_name) === 'frank' && ['hirat', 'horat'].includes(clean(row.second_profile_last_name)))
  ))

  return { candidates, exact }
}

function emailForFrank(camper: any) {
  const isSecondary = clean(camper.second_profile_first_name) === 'frank' && ['hirat', 'horat'].includes(clean(camper.second_profile_last_name))
  return clean(isSecondary ? camper.secondary_email : camper.email)
}

async function generateSetupUrl(admin: any, email: string) {
  const origin = getSiteUrl()
  let result = await admin.auth.admin.generateLink({
    type: 'invite',
    email,
    options: { redirectTo: `${origin}/set-password` },
  })

  if (result.error) {
    result = await admin.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo: `${origin}/set-password` },
    })
  }

  const tokenHash = result.data?.properties?.hashed_token
  const verificationType = result.data?.properties?.verification_type
  if (result.error || !tokenHash || !verificationType) {
    throw new Error(result.error?.message || 'Unable to create the setup link.')
  }

  return `${origin}/set-password?token_hash=${encodeURIComponent(tokenHash)}&type=${encodeURIComponent(verificationType)}`
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  const admin = adminClient()
  if (!admin) return NextResponse.json({ error: 'Production database is unavailable.' }, { status: 500 })

  try {
    const { candidates, exact } = await findFrank(admin)
    return NextResponse.json({
      exact: exact.map((row: any) => ({
        id: row.id,
        name: `${row.first_name || ''} ${row.last_name || ''}`.trim(),
        secondProfileName: `${row.second_profile_first_name || ''} ${row.second_profile_last_name || ''}`.trim(),
        lotNumber: row.lot_number,
        hasSetupEmail: Boolean(emailForFrank(row)),
      })),
      candidateCount: candidates.length,
      candidates: candidates.map((row: any) => ({
        name: `${row.first_name || ''} ${row.last_name || ''}`.trim(),
        secondProfileName: `${row.second_profile_first_name || ''} ${row.second_profile_last_name || ''}`.trim(),
        lotNumber: row.lot_number,
        hasPrimaryEmail: Boolean(clean(row.email)),
        hasSecondaryEmail: Boolean(clean(row.secondary_email)),
      })),
    })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Unable to find Frank Hirat.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  const admin = adminClient()
  if (!admin) return NextResponse.json({ error: 'Production database is unavailable.' }, { status: 500 })
  if (!isTwilioConfigured()) return NextResponse.json({ error: 'Twilio is not configured.' }, { status: 500 })

  try {
    const { exact } = await findFrank(admin)
    if (exact.length !== 1) {
      return NextResponse.json({ error: `Expected one active Frank Hirat camper record; found ${exact.length}.` }, { status: 409 })
    }

    const camper = exact[0]
    const email = emailForFrank(camper)
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      return NextResponse.json({ error: 'Frank Hirat does not have a valid profile email for portal setup.' }, { status: 409 })
    }

    const phone = formatSmsPhone(TARGET_PHONE)
    const { data: prior } = await admin
      .from('text_reminders')
      .select('id')
      .eq('reminder_type', MARKER)
      .eq('recipient_phone', phone)
      .eq('status', 'sent')
      .limit(1)
    if (prior?.length) {
      return NextResponse.json({ success: true, alreadySent: true, lotNumber: camper.lot_number, phone })
    }

    const setupUrl = await generateSetupUrl(admin, email)
    const message = [
      'Bur Oaks Campground: Frank, use this private link to set up your camper portal within 24 hours:',
      setupUrl,
      'Keep this link private. Questions? Contact Anthony at 618-882-8063. Reply STOP to opt out.',
    ].join('\n')
    const result = await sendTwilioSms({ to: phone, body: message })

    await admin.from('text_reminders').insert({
      camper_id: camper.id,
      invoice_id: null,
      reminder_type: MARKER,
      message,
      sent_at: new Date().toISOString(),
      status: result.sent ? 'sent' : 'failed',
      recipient_phone: phone,
      provider: 'twilio',
      provider_message_id: result.sent ? result.providerMessageId : null,
      error_message: result.sent ? null : result.error,
      sent_by: 'one-time-frank-hirat-setup-text-2026-08-29',
    })

    if (!result.sent) return NextResponse.json({ error: result.error, lotNumber: camper.lot_number }, { status: 502 })
    return NextResponse.json({ success: true, alreadySent: false, lotNumber: camper.lot_number, phone })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Unable to send Frank Hirat’s portal setup text.' }, { status: 500 })
  }
}
