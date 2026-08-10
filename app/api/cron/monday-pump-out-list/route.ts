import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { sendPumpOutReport } from '../../../../lib/pump-out-report'

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
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date())
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || ''
  return {
    date: `${value('year')}-${value('month')}-${value('day')}`,
    weekday: value('weekday'),
    hour: Number(value('hour')),
  }
}

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET
  return Boolean(secret) && request.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Cron is not authorized.' }, { status: 401 })
  }

  const current = centralNow()
  // Vercel Hobby permits one cron invocation per day. 13:00 UTC lands at
  // 8:00 AM Central during daylight time and 7:00 AM during standard time.
  if (current.weekday !== 'Mon' || (current.hour !== 7 && current.hour !== 8)) {
    return NextResponse.json({ success: true, skipped: true, reason: 'Not the scheduled Monday-morning Central window.', current })
  }

  const admin = adminClient()
  if (!admin) return NextResponse.json({ error: 'Supabase service key is not configured.' }, { status: 500 })

  const reportKey = 'monday-pump-out-list'
  const { data: reservation, error: reserveError } = await admin
    .from('scheduled_reports')
    .insert({ report_key: reportKey, report_date: current.date, status: 'running' })
    .select('id')
    .single()

  if (reserveError?.code === '23505') {
    const { data: existing } = await admin
      .from('scheduled_reports')
      .select('id,status')
      .eq('report_key', reportKey)
      .eq('report_date', current.date)
      .maybeSingle()

    return NextResponse.json({
      success: true,
      skipped: true,
      reason: existing?.status === 'running' ? 'This Monday report is already running.' : 'This Monday report was already handled.',
      status: existing?.status || 'unknown',
    })
  }

  if (reserveError || !reservation) {
    return NextResponse.json({ error: reserveError?.message || 'Unable to reserve this report.' }, { status: 500 })
  }

  try {
    const result = await sendPumpOutReport(admin, current.date)
    const status = result.office.sent && result.printer.sent ? 'sent' : result.office.sent || result.printer.sent ? 'partial' : 'failed'
    const errors = [result.office.error, result.printer.error].filter(Boolean).join(' | ')

    await admin.from('scheduled_reports').update({
      status,
      item_count: result.requests.length,
      office_email_status: result.office.sent ? 'sent' : 'failed',
      printer_email_status: result.printer.sent ? 'sent' : 'failed',
      error_message: errors || null,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', reservation.id)

    return NextResponse.json({
      success: status === 'sent',
      status,
      reportDate: current.date,
      itemCount: result.requests.length,
      office: result.office,
      printer: result.printer,
    }, { status: status === 'failed' ? 502 : 200 })
  } catch (error: any) {
    await admin.from('scheduled_reports').update({
      status: 'failed',
      error_message: String(error?.message || error).slice(0, 2000),
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', reservation.id)
    return NextResponse.json({ error: error?.message || 'Unable to send the Monday pump-out report.' }, { status: 500 })
  }
}
