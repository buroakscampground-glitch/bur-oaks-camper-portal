import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { loadCampgroundBillingSettings } from '../../../../lib/campground-settings'
import { sendTwilioSms } from '../../../../lib/twilio-sms'
import { siteCareEnforcementFor, siteCareSourceMarker } from '../../../../lib/site-care-enforcement'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mzywctpxnpejglnspyqi.supabase.co'

function adminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  return serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey) : null
}

function centralNow() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date())
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || ''
  return {
    date: `${value('year')}-${value('month')}-${value('day')}`,
    hour: Number(value('hour')),
    minute: Number(value('minute')),
  }
}

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET
  return Boolean(secret) && request.headers.get('authorization') === `Bearer ${secret}`
}

function cleanLotNumber(value: unknown) {
  return String(value || '').trim().replace(/^lot\s+/i, '')
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) return NextResponse.json({ error: 'Cron is not authorized.' }, { status: 401 })

  const current = centralNow()
  // Vercel Hobby permits one daily cron expression. 06:01 UTC lands at
  // 12:01 AM Central in winter and 1:01 AM during daylight-saving time, so an
  // item is never enforced before its selected Central calendar date.
  if (![0, 1].includes(current.hour)) {
    return NextResponse.json({ success: true, skipped: true, reason: 'Not the after-midnight Central window.', current })
  }

  const admin = adminClient()
  if (!admin) return NextResponse.json({ error: 'Supabase service key is not configured.' }, { status: 500 })

  const settings = await loadCampgroundBillingSettings(admin)
  const { data: notices, error: noticeError } = await admin
    .from('site_care_notices')
    .select('*')
    .in('status', ['Open', 'Acknowledged'])
    .like('template_key', 'auto:%')
    .lte('due_date', current.date)
    .order('due_date', { ascending: true })

  if (noticeError) return NextResponse.json({ error: noticeError.message }, { status: 500 })

  const results: Array<Record<string, unknown>> = []
  for (const notice of notices || []) {
    const enforcement = siteCareEnforcementFor(notice.template_key, settings)
    if (!enforcement) {
      results.push({ noticeId: notice.id, success: false, error: 'No valid saved charge is configured.' })
      continue
    }

    const { data: camper, error: camperError } = await admin
      .from('campers')
      .select('id,first_name,last_name,lot_number')
      .eq('id', notice.camper_id)
      .maybeSingle()
    if (camperError || !camper) {
      results.push({ noticeId: notice.id, success: false, error: camperError?.message || 'Camper not found.' })
      continue
    }

    const marker = siteCareSourceMarker(String(notice.id))
    const camperName = `${camper.first_name || ''} ${camper.last_name || ''}`.trim() || 'Camper'
    const lotNumber = cleanLotNumber(notice.lot_number || camper.lot_number)
    const chargeNotes = `Automatic deadline charge · ${marker}`
    const ticketDescription = `${notice.message} The camper did not mark this site-care item ready for office review before the automatic date ${notice.due_date}. Complete only the listed grounds work; do not move or handle the camper's personal property. ${marker}`

    const [{ data: existingCharge }, { data: existingTicket }] = await Promise.all([
      admin.from('site_service_charges').select('id').eq('notes', chargeNotes).limit(1).maybeSingle(),
      admin.from('maintenance_tickets').select('id').ilike('description', `%${marker}%`).limit(1).maybeSingle(),
    ])

    let chargeId = existingCharge?.id || ''
    if (!chargeId) {
      const { data: charge, error: chargeError } = await admin.from('site_service_charges').insert({
        camper_id: camper.id,
        lot_number: lotNumber || null,
        camper_name: camperName,
        service_type: enforcement.serviceType,
        service_label: enforcement.serviceLabel,
        charge_amount: enforcement.chargeAmount,
        notes: chargeNotes,
        performed_at: new Date().toISOString(),
        created_by: 'Automatic site care enforcement',
      }).select('id').single()
      if (chargeError || !charge) {
        results.push({ noticeId: notice.id, success: false, error: chargeError?.message || 'Charge could not be created.' })
        continue
      }
      chargeId = charge.id
    }

    let ticketId = existingTicket?.id || ''
    if (!ticketId) {
      const now = new Date().toISOString()
      const { data: ticket, error: ticketError } = await admin.from('maintenance_tickets').insert({
        camper_id: camper.id,
        title: enforcement.maintenanceTitle,
        description: ticketDescription,
        category: 'Grounds',
        priority: notice.priority === 'Important' ? 'High' : 'Normal',
        assigned_to: 'Open',
        lot_number: lotNumber,
        reported_by: 'Automatic site care enforcement',
        status: 'Open',
        work_order: true,
        admin_approved: true,
        approved_at: now,
        approved_by: 'Automatic site care enforcement',
      }).select('id').single()
      if (ticketError || !ticket) {
        results.push({ noticeId: notice.id, success: false, chargeId, error: ticketError?.message || 'Work order could not be created.' })
        continue
      }
      ticketId = ticket.id
    }

    const resolvedAt = new Date().toISOString()
    const { error: resolveError } = await admin.from('site_care_notices').update({
      status: 'Resolved',
      resolved_at: resolvedAt,
      resolved_by: 'Automatic site care enforcement',
    }).eq('id', notice.id).in('status', ['Open', 'Acknowledged'])

    results.push({
      noticeId: notice.id,
      success: !resolveError,
      lotNumber,
      chargeId,
      ticketId,
      amount: enforcement.chargeAmount,
      error: resolveError?.message,
    })
  }

  const completed = results.filter((result) => result.success)
  if (completed.length && process.env.OWNER_ALERT_PHONE) {
    const lots = completed.map((result) => result.lotNumber).filter(Boolean).join(', ')
    await sendTwilioSms({
      to: process.env.OWNER_ALERT_PHONE,
      body: `Bur Oaks: ${completed.length} overdue site-care item${completed.length === 1 ? '' : 's'} automatically became approved maintenance work orders and site-service charges. Lot${completed.length === 1 ? '' : 's'} ${lots}. https://www.buroakscampground.com/admin/site-care`,
    })
  }

  const failed = results.filter((result) => !result.success)
  return NextResponse.json({
    success: failed.length === 0,
    date: current.date,
    processed: completed.length,
    failed: failed.length,
    results,
  }, { status: failed.length ? 500 : 200 })
}
