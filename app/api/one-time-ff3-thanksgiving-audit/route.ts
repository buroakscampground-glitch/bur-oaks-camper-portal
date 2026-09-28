import { createHash, timingSafeEqual } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { formatSmsPhone } from '../../../lib/twilio-sms'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const expectedTokenHash = '794efeb3bb484b921bb546bad5052b0415f213eb24140d94234f3b88d5ff674e'

function authorized(request: Request) {
  const token = request.headers.get('x-audit-token') || ''
  const actual = createHash('sha256').update(token).digest('hex')
  return timingSafeEqual(Buffer.from(actual), Buffer.from(expectedTokenHash))
}

function maskedPhone(value: unknown) {
  const phone = formatSmsPhone(value)
  return phone ? `***-***-${phone.slice(-4)}` : ''
}

function normalizedSite(value: unknown) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

async function twilioStatus(messageSid: string) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  if (!messageSid || !accountSid || !authToken) return null

  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages/${encodeURIComponent(messageSid)}.json`, {
    headers: { Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}` },
    cache: 'no-store',
  })
  const result = await response.json().catch(() => ({}))
  return response.ok ? {
    status: result.status || '',
    errorCode: result.error_code || null,
    errorMessage: result.error_message || null,
    dateSent: result.date_sent || null,
    dateUpdated: result.date_updated || null,
  } : { status: 'lookup_failed', errorCode: result.code || response.status, errorMessage: result.message || '' }
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return NextResponse.json({ error: 'Database configuration is missing.' }, { status: 500 })
  const admin = createClient(url, serviceKey)

  const { data: camperRows, error: camperError } = await admin
    .from('campers')
    .select('id,lot_number,first_name,last_name,phone,alternate_phone,second_profile_phone,sms_opt_in,event_reminders_opt_in,active,sms_opt_out_at,sms_last_keyword')
  if (camperError) return NextResponse.json({ error: camperError.message }, { status: 500 })

  const campers = (camperRows || []).filter((camper: any) =>
    normalizedSite(camper.lot_number) === 'FF3' ||
    (/dave/i.test(String(camper.first_name || '')) && normalizedSite(camper.lot_number).includes('FF3'))
  )
  const camperIds = campers.map((camper: any) => camper.id)
  const phones = Array.from(new Set(campers.flatMap((camper: any) => [camper.phone, camper.alternate_phone, camper.second_profile_phone].map(formatSmsPhone).filter(Boolean))))

  const { data: consentRows, error: consentError } = camperIds.length
    ? await admin.from('sms_phone_consents').select('camper_id,phone_number,opted_in,opted_in_at,opted_out_at,source,updated_at').in('camper_id', camperIds)
    : { data: [], error: null }
  if (consentError && !['42P01', 'PGRST205'].includes(consentError.code || '')) return NextResponse.json({ error: consentError.message }, { status: 500 })

  const { data: broadcastRows, error: broadcastError } = await admin
    .from('sms_broadcasts')
    .select('id,reminder_type,message,status,recipient_count,sent_count,failed_count,created_at,completed_at')
    .order('created_at', { ascending: false })
    .limit(100)
  if (broadcastError) return NextResponse.json({ error: broadcastError.message }, { status: 500 })
  const broadcasts = (broadcastRows || []).filter((row: any) => /thanksgiving/i.test(`${row.reminder_type || ''} ${row.message || ''}`)).slice(0, 10)
  const broadcastIds = broadcasts.map((row: any) => row.id)

  const { data: deliveryRows, error: deliveryError } = broadcastIds.length
    ? await admin.from('sms_broadcast_deliveries').select('id,broadcast_id,camper_id,recipient_phone,status,provider_message_id,error_message,created_at,completed_at').in('broadcast_id', broadcastIds)
    : { data: [], error: null }
  if (deliveryError) return NextResponse.json({ error: deliveryError.message }, { status: 500 })

  const matchingDeliveries = (deliveryRows || []).filter((row: any) => camperIds.includes(row.camper_id) || phones.includes(formatSmsPhone(row.recipient_phone)))
  const deliveries = await Promise.all(matchingDeliveries.map(async (row: any) => ({
    broadcastId: row.broadcast_id,
    camperMatched: camperIds.includes(row.camper_id),
    phone: maskedPhone(row.recipient_phone),
    status: row.status,
    error: row.error_message || null,
    createdAt: row.created_at,
    completedAt: row.completed_at,
    providerMessageId: row.provider_message_id || null,
    twilio: row.provider_message_id ? await twilioStatus(row.provider_message_id) : null,
  })))

  return NextResponse.json({
    checkedAt: new Date().toISOString(),
    campers: campers.map((camper: any) => ({
      id: camper.id,
      site: camper.lot_number,
      name: `${camper.first_name || ''} ${camper.last_name || ''}`.trim(),
      active: camper.active !== false,
      smsOptIn: camper.sms_opt_in,
      eventRemindersOptIn: camper.event_reminders_opt_in,
      smsOptOutAt: camper.sms_opt_out_at || null,
      smsLastKeyword: camper.sms_last_keyword || null,
      phones: [camper.phone, camper.alternate_phone, camper.second_profile_phone].map(maskedPhone).filter(Boolean),
    })),
    consents: (consentRows || []).map((row: any) => ({
      camperId: row.camper_id,
      phone: maskedPhone(row.phone_number),
      optedIn: row.opted_in,
      optedInAt: row.opted_in_at,
      optedOutAt: row.opted_out_at,
      source: row.source,
      updatedAt: row.updated_at,
    })),
    broadcasts,
    deliveries,
  })
}
