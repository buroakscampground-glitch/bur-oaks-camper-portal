import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isOperationalCamper } from '../../../lib/camper-records'
import { consentedCamperSmsPhones } from '../../../lib/camper-sms'
import { uniqueSmsBroadcastRecipients, maskSmsPhone } from '../../../lib/sms-broadcast'

export const runtime = 'nodejs'
export const maxDuration = 60

const auditToken = 'last-text-audit-6d73919e-7d2c-4fe0-92cc-9a313223b889'

async function providerStatus(messageId: string) {
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

  const [{ data: broadcasts, error: broadcastError }, { data: campers, error: camperError }] = await Promise.all([
    admin
      .from('sms_broadcasts')
      .select('id,reminder_type,message,target_mode,target_camper_id,status,recipient_count,duplicate_recipient_count,sent_count,failed_count,created_at')
      .order('created_at', { ascending: false })
      .limit(25),
    admin
      .from('campers')
      .select('id,lot_number,first_name,last_name,phone,alternate_phone,second_profile_phone,sms_opt_in,active,role')
      .eq('active', true)
      .eq('sms_opt_in', true)
      .order('lot_number', { ascending: true }),
  ])

  if (broadcastError || camperError) {
    return NextResponse.json({ error: broadcastError?.message || camperError?.message }, { status: 500 })
  }

  const recent = broadcasts || []
  const lastAll = recent.find((row: any) => row.target_mode === 'all_opted_in') || recent[0]
  if (!lastAll) return NextResponse.json({ broadcasts: [], audit: null })

  const operational = (campers || []).filter(isOperationalCamper)
  const candidates = []
  for (const camper of operational) {
    candidates.push({ camper, phones: await consentedCamperSmsPhones(admin, camper) })
  }
  const plan = uniqueSmsBroadcastRecipients(candidates)

  const { data: deliveries, error: deliveryError } = await admin
    .from('sms_broadcast_deliveries')
    .select('camper_id,recipient_phone,status,error_message,provider_message_id,created_at,completed_at')
    .eq('broadcast_id', lastAll.id)
  if (deliveryError) return NextResponse.json({ error: deliveryError.message }, { status: 500 })

  const rows = deliveries || []
  const deliveredPhones = new Set(rows.map((row: any) => String(row.recipient_phone || '')))
  const missing = plan.recipients
    .filter((recipient) => !deliveredPhones.has(recipient.phone))
    .map((recipient) => ({
      camperId: recipient.camper.id,
      lot: recipient.camper.lot_number,
      name: `${recipient.camper.first_name || ''} ${recipient.camper.last_name || ''}`.trim(),
      phone: maskSmsPhone(recipient.phone),
    }))

  const failed = rows
    .filter((row: any) => row.status === 'failed')
    .map((row: any) => {
      const camper = operational.find((item: any) => String(item.id) === String(row.camper_id))
      return {
        lot: camper?.lot_number || '',
        name: camper ? `${camper.first_name || ''} ${camper.last_name || ''}`.trim() : '',
        phone: maskSmsPhone(row.recipient_phone),
        error: row.error_message || '',
      }
    })

  const catoIds = new Set(operational
    .filter((camper: any) => String(camper.last_name || '').trim().toLowerCase() === 'cato')
    .map((camper: any) => String(camper.id)))
  const catoDeliveries = await Promise.all(rows
    .filter((row: any) => catoIds.has(String(row.camper_id)))
    .map(async (row: any) => {
      const status = await providerStatus(String(row.provider_message_id || ''))
      return {
        phone: maskSmsPhone(row.recipient_phone),
        databaseStatus: row.status,
        providerStatus: status.status,
        error: row.error_message || status.error || '',
        completedAt: row.completed_at,
      }
    }))

  return NextResponse.json({
    broadcasts: recent.map((row: any) => ({
      id: row.id,
      type: row.reminder_type,
      message: row.message,
      targetMode: row.target_mode,
      status: row.status,
      recipientCount: row.recipient_count,
      sentCount: row.sent_count,
      failedCount: row.failed_count,
      createdAt: row.created_at,
    })),
    audit: {
      campaign: {
        id: lastAll.id,
        type: lastAll.reminder_type,
        message: lastAll.message,
        createdAt: lastAll.created_at,
      },
      eligiblePhonesNow: plan.recipients.length,
      deliveryRows: rows.length,
      missing,
      failed,
      catoDeliveries,
    },
  })
}
