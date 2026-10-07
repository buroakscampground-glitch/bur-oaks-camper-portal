import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { camperSmsPhones } from '../../../lib/camper-sms'

export const runtime = 'nodejs'
export const maxDuration = 60

const auditToken = 'cato-dinner-9f67d5a8-51d4-4a36-b1ce-10c80246b7c9'

function maskPhone(value: unknown) {
  const digits = String(value || '').replace(/\D/g, '')
  return digits.length >= 4 ? `***-***-${digits.slice(-4)}` : ''
}

async function twilioStatus(messageId: string) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  if (!messageId || !accountSid || !authToken) return { status: '', error: '' }

  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages/${encodeURIComponent(messageId)}.json`, {
    headers: { Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}` },
    cache: 'no-store',
  })
  const result = await response.json().catch(() => ({}))
  return {
    status: response.ok ? String(result.status || '') : '',
    error: response.ok ? String(result.error_message || '') : String(result.message || ''),
  }
}

export async function GET(request: Request) {
  if (new URL(request.url).searchParams.get('token') !== auditToken) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return NextResponse.json({ error: 'Database is unavailable.' }, { status: 500 })
  const admin = createClient(url, key)

  const camperResult = await admin
    .from('campers')
    .select('id,lot_number,first_name,last_name,phone,alternate_phone,second_profile_phone,sms_opt_in,active')
    .ilike('last_name', 'Cato')
    .eq('active', true)

  if (camperResult.error) return NextResponse.json({ error: camperResult.error.message }, { status: 500 })
  const campers = camperResult.data || []
  const camperIds = campers.map((camper: any) => camper.id)
  const savedPhones = Array.from(new Set(campers.flatMap((camper: any) => camperSmsPhones(camper))))
  if (!camperIds.length) return NextResponse.json({ campers: [], deliveries: [] })

  const [camperDeliveryResult, phoneDeliveryResult, consentResult, recentBroadcastResult] = await Promise.all([
    admin
      .from('sms_broadcast_deliveries')
      .select('id,broadcast_id,camper_id,status,recipient_phone,provider_message_id,error_message,created_at,completed_at')
      .in('camper_id', camperIds)
      .gte('created_at', '2026-10-01T00:00:00Z')
      .order('created_at', { ascending: false }),
    savedPhones.length
      ? admin
        .from('sms_broadcast_deliveries')
        .select('id,broadcast_id,camper_id,status,recipient_phone,provider_message_id,error_message,created_at,completed_at')
        .in('recipient_phone', savedPhones)
        .gte('created_at', '2026-10-01T00:00:00Z')
        .order('created_at', { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    admin
      .from('sms_phone_consents')
      .select('camper_id,phone_number,opted_in,source,opted_out_at,updated_at')
      .in('camper_id', camperIds),
    admin
      .from('sms_broadcasts')
      .select('id,reminder_type,message,status,recipient_count,sent_count,failed_count,created_at')
      .gte('created_at', '2026-10-01T00:00:00Z')
      .order('created_at', { ascending: false }),
  ])

  const firstError = camperDeliveryResult.error || phoneDeliveryResult.error || consentResult.error || recentBroadcastResult.error
  if (firstError) return NextResponse.json({ error: firstError.message }, { status: 500 })
  const allDeliveries = Array.from(new Map([...(camperDeliveryResult.data || []), ...(phoneDeliveryResult.data || [])].map((row: any) => [String(row.id), row])).values())
  const broadcastIds = Array.from(new Set(allDeliveries.map((row: any) => row.broadcast_id).filter(Boolean)))
  const broadcastResult = broadcastIds.length
    ? await admin.from('sms_broadcasts').select('id,reminder_type,message,status,created_at').in('id', broadcastIds)
    : { data: [], error: null }
  if (broadcastResult.error) return NextResponse.json({ error: broadcastResult.error.message }, { status: 500 })

  const broadcasts = new Map((broadcastResult.data || []).map((row: any) => [String(row.id), row]))
  const relevant = allDeliveries.filter((delivery: any) => {
    const broadcast: any = broadcasts.get(String(delivery.broadcast_id))
    return /dinner|hog|pork|october 10|oct 10|thanksgiving/i.test(`${broadcast?.reminder_type || ''} ${broadcast?.message || ''}`)
  })

  const deliveries = await Promise.all(relevant.map(async (delivery: any) => {
    const broadcast: any = broadcasts.get(String(delivery.broadcast_id))
    const provider = await twilioStatus(String(delivery.provider_message_id || ''))
    return {
      lot: campers.find((camper: any) => String(camper.id) === String(delivery.camper_id))?.lot_number || '',
      reminderType: broadcast?.reminder_type || '',
      message: broadcast?.message || '',
      campaignStatus: broadcast?.status || '',
      databaseStatus: delivery.status || '',
      providerStatus: provider.status,
      phone: maskPhone(delivery.recipient_phone),
      sentAt: delivery.completed_at || delivery.created_at,
      error: delivery.error_message || provider.error || '',
    }
  }))

  return NextResponse.json({
    campers: campers.map((camper: any) => ({
      lot: camper.lot_number,
      name: `${camper.first_name || ''} ${camper.last_name || ''}`.trim(),
      smsOptIn: camper.sms_opt_in,
      phones: [camper.phone, camper.alternate_phone, camper.second_profile_phone].map(maskPhone).filter(Boolean),
    })),
    consents: (consentResult.data || []).map((consent: any) => ({
      phone: maskPhone(consent.phone_number),
      optedIn: consent.opted_in,
      source: consent.source,
      optedOutAt: consent.opted_out_at,
      updatedAt: consent.updated_at,
    })),
    recentDinnerCampaigns: (recentBroadcastResult.data || []).filter((broadcast: any) =>
      /dinner|hog|pork|october 10|oct 10|thanksgiving/i.test(`${broadcast.reminder_type || ''} ${broadcast.message || ''}`)
    ),
    deliveries,
  })
}
