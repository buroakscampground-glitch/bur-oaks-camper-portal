import { createHmac, timingSafeEqual } from 'crypto'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { formatSmsPhone } from '../../../../lib/twilio-sms'
import { getSiteUrl } from '../../../../lib/site-url'
import { camperSmsPhones } from '../../../../lib/camper-sms'

export const runtime = 'nodejs'

function validTwilioSignature(url: string, params: URLSearchParams, received: string, token: string) {
  let payload = url
  for (const key of Array.from(new Set(params.keys())).sort()) {
    for (const value of params.getAll(key).sort()) payload += `${key}${value}`
  }

  const expected = createHmac('sha1', token).update(payload).digest('base64')
  const expectedBytes = Buffer.from(expected)
  const receivedBytes = Buffer.from(received || '')
  return expectedBytes.length === receivedBytes.length && timingSafeEqual(expectedBytes, receivedBytes)
}

function twiml() {
  return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
    status: 200,
    headers: { 'Content-Type': 'text/xml; charset=utf-8' },
  })
}

export async function POST(request: Request) {
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const signature = request.headers.get('x-twilio-signature') || ''

  if (!authToken || !supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: 'Webhook is not configured.' }, { status: 503 })
  }

  const params = new URLSearchParams(await request.text())
  const incomingUrl = new URL(request.url)
  const signedUrl = `${getSiteUrl()}${incomingUrl.pathname}${incomingUrl.search}`

  if (!validTwilioSignature(signedUrl, params, signature, authToken)) {
    return NextResponse.json({ error: 'Invalid Twilio signature.' }, { status: 403 })
  }

  const from = formatSmsPhone(params.get('From'))
  const keyword = String(params.get('Body') || '').trim().toUpperCase().split(/\s+/)[0] || ''
  const messageSid = params.get('MessageSid') || null
  const optOutKeywords = new Set(['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT'])
  const optInKeywords = new Set(['START', 'UNSTOP', 'YES'])
  const action = optOutKeywords.has(keyword)
    ? 'opt_out'
    : optInKeywords.has(keyword)
      ? 'opt_in'
      : keyword === 'HELP'
        ? 'help'
        : 'other'

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: campers } = await admin
    .from('campers')
    .select('id,phone,alternate_phone,second_profile_phone,sms_opt_in_at,event_reminders_opt_in_at')
    .eq('active', true)
  const camper = (campers || []).find((item) => camperSmsPhones(item).includes(from || ''))

  if (camper && from && (action === 'opt_out' || action === 'opt_in')) {
    const now = new Date().toISOString()
    const optedIn = action === 'opt_in'
    const { error: consentError } = await admin.from('sms_phone_consents').upsert({
      camper_id: camper.id,
      phone_number: from,
      opted_in: optedIn,
      opted_in_at: optedIn ? now : null,
      opted_out_at: optedIn ? null : now,
      source: 'twilio-keyword',
      updated_at: now,
    }, { onConflict: 'camper_id,phone_number' })

    if (consentError && !['42P01', 'PGRST205'].includes(consentError.code || '')) {
      console.error('Unable to update phone consent:', consentError.code)
      return NextResponse.json({ error: 'Unable to update text consent.' }, { status: 500 })
    }

    let householdEnabled = optedIn
    if (!consentError && !optedIn) {
      const savedPhones = camperSmsPhones(camper)
      const { data: consentRows } = await admin
        .from('sms_phone_consents')
        .select('phone_number,opted_in')
        .eq('camper_id', camper.id)
        .in('phone_number', savedPhones)
      householdEnabled = (consentRows || []).some((row) => row.opted_in === true)
    }

    await admin.from('campers').update({
      sms_opt_in: householdEnabled,
      event_reminders_opt_in: householdEnabled,
      sms_opt_in_at: optedIn ? now : camper.sms_opt_in_at,
      event_reminders_opt_in_at: optedIn ? now : camper.event_reminders_opt_in_at,
      sms_opt_out_at: householdEnabled ? null : now,
      sms_last_keyword: keyword,
    }).eq('id', camper.id)
  }

  const { error: logError } = await admin.from('sms_consent_events').insert({
    camper_id: camper?.id || null,
    phone_number: from || String(params.get('From') || ''),
    keyword: keyword || '(blank)',
    consent_action: action,
    provider_message_id: messageSid,
  })

  if (logError && logError.code !== '23505' && !['42P01', 'PGRST205'].includes(logError.code || '')) {
    console.error('Unable to log Twilio consent event:', logError.code)
  }

  return twiml()
}
