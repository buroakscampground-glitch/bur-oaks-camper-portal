import { createHash, timingSafeEqual } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { formatSmsPhone } from '../../../lib/twilio-sms'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const expectedTokenHash = 'c84c9202aad0324c49f8902493d3736e5f4adc87405faf87c533b23ee79bd7e0'

function authorized(request: Request) {
  const actual = createHash('sha256').update(request.headers.get('x-update-token') || '').digest('hex')
  return timingSafeEqual(Buffer.from(actual), Buffer.from(expectedTokenHash))
}

function masked(value: unknown) {
  const phone = formatSmsPhone(value)
  return phone ? `***-***-${phone.slice(-4)}` : null
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return NextResponse.json({ error: 'Database configuration is missing.' }, { status: 500 })
  const admin = createClient(url, serviceKey)

  const { data: matches, error: lookupError } = await admin
    .from('campers')
    .select('id,lot_number,first_name,last_name,phone,alternate_phone,second_profile_first_name,second_profile_last_name,second_profile_phone,sms_opt_in,event_reminders_opt_in')
    .ilike('lot_number', 'FF3')
    .limit(2)
  if (lookupError) return NextResponse.json({ error: lookupError.message }, { status: 500 })
  if (matches?.length !== 1) return NextResponse.json({ error: `Expected one FF3 record; found ${matches?.length || 0}.` }, { status: 409 })

  const camper = matches[0]
  if (!/sally/i.test(String(camper.first_name || '')) || !/weyhaupt/i.test(String(camper.last_name || ''))) {
    return NextResponse.json({ error: 'FF3 identity did not match Sally Weyhaupt; no change made.' }, { status: 409 })
  }
  const secondPhone = formatSmsPhone(camper.second_profile_phone || camper.alternate_phone)
  if (!secondPhone) return NextResponse.json({ error: 'FF3 does not have a second mobile number; no change made.' }, { status: 409 })

  const duplicateAlternate = formatSmsPhone(camper.alternate_phone) === secondPhone
  const update = {
    second_profile_first_name: 'Dave',
    second_profile_last_name: 'Weyhaupt',
    second_profile_phone: camper.second_profile_phone || camper.alternate_phone,
    alternate_phone: duplicateAlternate ? null : camper.alternate_phone,
  }
  const { data: saved, error: updateError } = await admin
    .from('campers')
    .update(update)
    .eq('id', camper.id)
    .select('lot_number,first_name,last_name,phone,alternate_phone,second_profile_first_name,second_profile_last_name,second_profile_phone,sms_opt_in,event_reminders_opt_in')
    .single()
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  return NextResponse.json({
    success: true,
    site: saved.lot_number,
    primary: { name: `${saved.first_name} ${saved.last_name}`, phone: masked(saved.phone) },
    secondary: { name: `${saved.second_profile_first_name} ${saved.second_profile_last_name}`, phone: masked(saved.second_profile_phone) },
    duplicateAdditionalPhoneRemoved: duplicateAlternate,
    smsOptInPreserved: saved.sms_opt_in,
    eventRemindersOptInPreserved: saved.event_reminders_opt_in,
  })
}
