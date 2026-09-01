import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { sendDailyPaymentReport } from '../../../../lib/daily-payment-report'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mzywctpxnpejglnspyqi.supabase.co'

function centralNow() {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(new Date())
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value || ''
  const date = `${part('year')}-${part('month')}-${part('day')}`
  const previous = new Date(`${date}T12:00:00Z`)
  previous.setUTCDate(previous.getUTCDate() - 1)
  return { date, reportDate: previous.toISOString().slice(0, 10), hour: Number(part('hour')) }
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: 'Cron is not authorized.' }, { status: 401 })
  const current = centralNow()
  if (current.hour !== 7 && current.hour !== 8) return NextResponse.json({ success: true, skipped: true, reason: 'Not the scheduled morning Central window.', current })
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) return NextResponse.json({ error: 'Supabase service key is not configured.' }, { status: 500 })
  const admin = createClient(supabaseUrl, key)
  const reportKey = 'daily-payment-register'
  let { data: reservation, error: reserveError } = await admin.from('scheduled_reports').insert({ report_key: reportKey, report_date: current.date, status: 'running' }).select('id').single()

  if (reserveError?.code === '23505') {
    const { data: existing } = await admin.from('scheduled_reports').select('id,status').eq('report_key', reportKey).eq('report_date', current.date).maybeSingle()
    if (existing?.status === 'sent') return NextResponse.json({ success: true, skipped: true, reason: 'The daily payment register already printed.' })
    if (existing?.id) {
      await admin.from('scheduled_reports').update({ status: 'running', error_message: null, started_at: new Date().toISOString(), completed_at: null, updated_at: new Date().toISOString() }).eq('id', existing.id)
      reservation = existing
      reserveError = null
    }
  }
  if (reserveError || !reservation) return NextResponse.json({ error: reserveError?.message || 'Unable to reserve the daily payment report.' }, { status: 500 })

  try {
    const result = await sendDailyPaymentReport(admin, current.reportDate)
    const status = result.office.sent && result.printer.sent ? 'sent' : result.office.sent || result.printer.sent ? 'partial' : 'failed'
    const errors = [result.office.error, result.printer.error].filter(Boolean).join(' | ')
    await admin.from('scheduled_reports').update({ status, item_count: result.rows.length, office_email_status: result.office.sent ? 'sent' : 'failed', printer_email_status: result.printer.sent ? 'sent' : 'failed', error_message: errors || null, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', reservation.id)
    return NextResponse.json({ success: status === 'sent', status, reportDate: current.reportDate, itemCount: result.rows.length, total: result.total, office: result.office, printer: result.printer, printers: result.printers }, { status: status === 'failed' ? 502 : 200 })
  } catch (error: any) {
    await admin.from('scheduled_reports').update({ status: 'failed', error_message: String(error?.message || error).slice(0, 2000), completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', reservation.id)
    return NextResponse.json({ error: error?.message || 'Unable to send the daily payment register.' }, { status: 500 })
  }
}
