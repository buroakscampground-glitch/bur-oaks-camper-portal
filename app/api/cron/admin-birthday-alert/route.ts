import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { birthdayIsToday, centralDate } from '../../../../lib/camper-celebrations'
import { isOperationalCamper } from '../../../../lib/camper-records'
import { sendStaffWebPush } from '../../../../lib/staff-web-push'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mzywctpxnpejglnspyqi.supabase.co'

function centralHour() {
  const hour = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date()).find((part) => part.type === 'hour')?.value
  return Number(hour || -1)
}

function profileName(camper: any, secondary = false) {
  return secondary
    ? `${camper.second_profile_first_name || ''} ${camper.second_profile_last_name || ''}`.trim()
    : `${camper.first_name || ''} ${camper.last_name || ''}`.trim()
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Cron is not authorized.' }, { status: 401 })
  }

  const hour = centralHour()
  if (hour < 6 || hour > 11) {
    return NextResponse.json({ success: true, skipped: true, reason: 'Outside the 6–11 a.m. Central alert window.', hour })
  }

  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) return NextResponse.json({ error: 'Supabase service key is not configured.' }, { status: 500 })
  const admin = createClient(supabaseUrl, key)
  const today = centralDate()
  const reportKey = 'admin-birthday-alert'
  let { data: reservation, error: reserveError } = await admin
    .from('scheduled_reports')
    .insert({ report_key: reportKey, report_date: today.iso, status: 'running' })
    .select('id')
    .single()

  if (reserveError?.code === '23505') {
    const { data: existing, error: existingError } = await admin
      .from('scheduled_reports')
      .select('id,status')
      .eq('report_key', reportKey)
      .eq('report_date', today.iso)
      .maybeSingle()
    if (existingError || !existing) {
      return NextResponse.json({ error: existingError?.message || 'Unable to check today\'s birthday alert.' }, { status: 500 })
    }
    if (existing.status === 'sent') {
      return NextResponse.json({ success: true, skipped: true, reason: 'Today\'s birthday alert was already sent.' })
    }
    const { data: retryReservation, error: retryError } = await admin
      .from('scheduled_reports')
      .update({ status: 'running', error_message: null, completed_at: null, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
      .select('id')
      .single()
    if (retryError || !retryReservation) {
      return NextResponse.json({ error: retryError?.message || 'Unable to retry today\'s birthday alert.' }, { status: 500 })
    }
    reservation = retryReservation
    reserveError = null
  }
  if (reserveError || !reservation) {
    return NextResponse.json({ error: reserveError?.message || 'Unable to reserve the birthday alert.' }, { status: 500 })
  }

  try {
    const [{ data: campers, error: camperError }, { data: blockedRenewals, error: renewalError }] = await Promise.all([
      admin
        .from('campers')
        .select('id,lot_number,first_name,last_name,second_profile_first_name,second_profile_last_name,birthday,second_profile_birthday,active,role')
        .eq('active', true),
      admin
        .from('season_renewals')
        .select('camper_id,status')
        .in('status', ['Camper Leaving', 'Campground Not Renewing']),
    ])
    if (camperError || renewalError) throw camperError || renewalError

    const blockedIds = new Set((blockedRenewals || []).map((row: any) => String(row.camper_id)))
    const birthdays = (campers || []).flatMap((camper: any) => {
      if (!isOperationalCamper(camper) || blockedIds.has(String(camper.id))) return []
      const results: Array<{ name: string; lot: string }> = []
      if (birthdayIsToday(camper.birthday, today)) {
        const name = profileName(camper)
        if (name) results.push({ name, lot: String(camper.lot_number || '') })
      }
      if (birthdayIsToday(camper.second_profile_birthday, today)) {
        const name = profileName(camper, true)
        if (name) results.push({ name, lot: String(camper.lot_number || '') })
      }
      return results
    })

    let push: any = { sent: 0, skipped: true, reason: 'No birthdays today.' }
    if (birthdays.length) {
      const preview = birthdays.slice(0, 2).map((birthday: any) => `${birthday.name}${birthday.lot ? ` (Lot ${birthday.lot})` : ''}`).join(' · ')
      const more = birthdays.length > 2 ? ` and ${birthdays.length - 2} more` : ''
      push = await sendStaffWebPush(admin, {
        title: birthdays.length === 1 ? 'Birthday at Bur Oaks today' : `${birthdays.length} birthdays at Bur Oaks today`,
        body: `${preview}${more}. Open Birthday Office for today\'s details.`,
        urlByRole: { admin: '/admin/birthdays', event_coordinator: '/community' },
        tag: `admin-birthdays-${today.iso}`,
        roles: ['admin'],
        badgeCount: birthdays.length,
      })
    }

    const delivered = birthdays.length === 0 || push.sent > 0
    await admin.from('scheduled_reports').update({
      status: delivered ? 'sent' : 'failed',
      item_count: birthdays.length,
      office_email_status: push.sent > 0 ? 'sent' : 'skipped',
      printer_email_status: 'skipped',
      error_message: delivered ? push.reason || null : push.reason || 'No administrator phone received the background alert.',
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', reservation.id)

    return NextResponse.json({ success: delivered, retryLater: !delivered, birthdayCount: birthdays.length, push }, { status: delivered ? 200 : 503 })
  } catch (error: any) {
    await admin.from('scheduled_reports').update({
      status: 'failed',
      error_message: String(error?.message || error).slice(0, 2000),
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', reservation.id)
    return NextResponse.json({ error: error?.message || 'Unable to send the birthday alert.' }, { status: 500 })
  }
}
