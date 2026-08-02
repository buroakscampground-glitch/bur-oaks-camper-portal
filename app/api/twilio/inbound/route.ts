import { createHmac, timingSafeEqual } from 'crypto'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { formatSmsPhone } from '../../../../lib/twilio-sms'
import { getSiteUrl } from '../../../../lib/site-url'

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
  const { data: campers } = await admin.from('campers').select('id,phone').eq('active', true)
  const camper = (campers || []).find((item) => formatSmsPhone(item.phone) === from)

  if (camper && action === 'opt_out') {
    await admin.from('campers').update({
      sms_opt_in: false,
      sms_opt_out_at: new Date().toISOString(),
      sms_last_keyword: keyword,
    }).eq('id', camper.id)
  } else if (camper && action === 'opt_in') {
    await admin.from('campers').update({
      sms_opt_in: true,
      sms_opt_in_at: new Date().toISOString(),
      sms_opt_out_at: null,
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
