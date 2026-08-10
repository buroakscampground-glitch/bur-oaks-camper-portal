import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { sendMaintenanceWorkOrderReport } from '../../../../lib/maintenance-work-order-report'

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
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date())
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || ''
  return { date: `${value('year')}-${value('month')}-${value('day')}`, hour: Number(value('hour')) }
}

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET
  return Boolean(secret) && request.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) return NextResponse.json({ error: 'Cron is not authorized.' }, { status: 401 })

  const current = centralNow()
  // 12:00 UTC is the 7:00 AM Central hour during campground daylight season
  // and the 6:00 AM hour during standard time. Vercel Hobby schedules use UTC.
  if (current.hour !== 6 && current.hour !== 7) {
    return NextResponse.json({ success: true, skipped: true, reason: 'Not the scheduled early-morning Central window.', current })
  }

  const admin = adminClient()
  if (!admin) return NextResponse.json({ error: 'Supabase service key is not configured.' }, { status: 500 })

  const reportKey = 'daily-maintenance-work-orders'
  const { data: reservation, error: reserveError } = await admin
    .from('scheduled_reports')
    .insert({ report_key: reportKey, report_date: current.date, status: 'running' })
    .select('id')
    .single()

  if (reserveError?.code === '23505') {
    return NextResponse.json({ success: true, skipped: true, reason: 'Today\'s work-order packet was already handled.' })
  }
  if (reserveError || !reservation) {
    return NextResponse.json({ error: reserveError?.message || 'Unable to reserve this report.' }, { status: 500 })
  }

  try {
    const result = await sendMaintenanceWorkOrderReport(admin, current.date)
    if (result.skipped) {
      await admin.from('scheduled_reports').update({
        status: 'sent', item_count: 0, office_email_status: 'skipped', printer_email_status: 'skipped',
        completed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).eq('id', reservation.id)
      return NextResponse.json({ success: true, skipped: true, reason: 'No active approved work orders.', itemCount: 0 })
    }

    const office = result.office!
    const printer = result.printer!
    const status = office.sent && printer.sent ? 'sent' : office.sent || printer.sent ? 'partial' : 'failed'
    const errors = [office.error, printer.error].filter(Boolean).join(' | ')
    await admin.from('scheduled_reports').update({
      status,
      item_count: result.orders.length,
      office_email_status: office.sent ? 'sent' : 'failed',
      printer_email_status: printer.sent ? 'sent' : 'failed',
      error_message: errors || null,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', reservation.id)

    return NextResponse.json({ success: status === 'sent', status, itemCount: result.orders.length, office, printer }, { status: status === 'failed' ? 502 : 200 })
  } catch (error: any) {
    await admin.from('scheduled_reports').update({
      status: 'failed', error_message: String(error?.message || error).slice(0, 2000),
      completed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq('id', reservation.id)
    return NextResponse.json({ error: error?.message || 'Unable to send the daily work-order packet.' }, { status: 500 })
  }
}
