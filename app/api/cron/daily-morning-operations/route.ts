import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { adminAlertRecipients, sendAdminAlertEmail } from '../../../../lib/admin-alert-email'
import { sendDailyPaymentReport } from '../../../../lib/daily-payment-report'
import { sendPumpOutReport } from '../../../../lib/pump-out-report'
import { getSiteUrl } from '../../../../lib/site-url'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mzywctpxnpejglnspyqi.supabase.co'

function centralNow() {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(new Date())
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || ''
  const date = `${value('year')}-${value('month')}-${value('day')}`
  const previous = new Date(`${date}T12:00:00Z`)
  previous.setUTCDate(previous.getUTCDate() - 1)
  return { date, paymentDate: previous.toISOString().slice(0, 10), hour: Number(value('hour')) }
}

function recipients() {
  const configured = (process.env.PAYMENT_ALERT_EMAILS || process.env.PAYMENT_REPORT_EMAIL || '')
    .split(',')
    .map((email) => email.trim())
    .filter(Boolean)
  return Array.from(new Map([...adminAlertRecipients(), ...configured].map((email) => [email.toLowerCase(), email])).values())
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: 'Cron is not authorized.' }, { status: 401 })
  const current = centralNow()
  if (current.hour !== 7 && current.hour !== 8) return NextResponse.json({ success: true, skipped: true, reason: 'Not the scheduled morning Central window.', current })
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) return NextResponse.json({ error: 'Supabase service key is not configured.' }, { status: 500 })
  const admin = createClient(supabaseUrl, key)
  const reportKey = 'daily-morning-operations'
  let { data: reservation, error: reserveError } = await admin.from('scheduled_reports').insert({ report_key: reportKey, report_date: current.date, status: 'running' }).select('id').single()

  if (reserveError?.code === '23505') {
    const { data: existing } = await admin.from('scheduled_reports').select('id,status').eq('report_key', reportKey).eq('report_date', current.date).maybeSingle()
    if (existing?.status === 'sent') return NextResponse.json({ success: true, skipped: true, reason: 'Today\'s morning office report was already handled.' })
    if (existing?.id) {
      await admin.from('scheduled_reports').update({ status: 'running', error_message: null, started_at: new Date().toISOString(), completed_at: null, updated_at: new Date().toISOString() }).eq('id', existing.id)
      reservation = existing
      reserveError = null
    }
  }
  if (reserveError || !reservation) return NextResponse.json({ error: reserveError?.message || 'Unable to reserve the morning report.' }, { status: 500 })

  try {
    const [payments, pumpOuts] = await Promise.all([
      sendDailyPaymentReport(admin, current.paymentDate, { sendOffice: false, sendPrinter: false }),
      sendPumpOutReport(admin, current.date, { sendOffice: false, sendPrinter: false }),
    ])
    const itemCount = payments.rows.length + pumpOuts.requests.length
    if (!itemCount) {
      await admin.from('scheduled_reports').update({ status: 'sent', item_count: 0, office_email_status: 'skipped', printer_email_status: 'skipped', completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', reservation.id)
      return NextResponse.json({ success: true, skipped: true, reason: 'No payments or pump-out requests to report.' })
    }

    let office: any = { skipped: true }
    if (itemCount) {
      office = await sendAdminAlertEmail({
        subject: `Bur Oaks morning office report - ${current.date}`,
        heading: 'Morning office report',
        message: 'Payments received yesterday and today\'s active pump-out route are together in this one email.',
        details: [
          { label: 'Payments received', value: `${payments.rows.length} totaling $${payments.total.toFixed(2)}` },
          { label: 'Active pump-outs', value: pumpOuts.requests.length },
        ],
        actionUrl: `${getSiteUrl()}/admin`,
        actionLabel: 'Open the admin portal',
        recipients: recipients(),
        attachments: [
          ...(payments.rows.length ? [{ filename: `bur-oaks-daily-payments-${current.paymentDate}.pdf`, content: payments.pdfBytes }] : []),
          ...(pumpOuts.requests.length ? [{ filename: `bur-oaks-pump-out-list-${current.date}.pdf`, content: pumpOuts.pdfBytes }] : []),
        ],
      })
    }
    const printerRun = pumpOuts.requests.length
      ? await sendPumpOutReport(admin, current.date, { sendOffice: false, sendPrinter: true })
      : null
    const officeSent = !office?.skipped
    const printerSent = !printerRun || printerRun.printer.sent
    const status = officeSent && printerSent
      ? 'sent'
      : officeSent || (pumpOuts.requests.length > 0 && printerSent)
        ? 'partial'
        : 'failed'
    const errors = [office?.reason, printerRun?.printer?.error].filter(Boolean).join(' | ')
    await admin.from('scheduled_reports').update({ status, item_count: itemCount, office_email_status: officeSent ? 'sent' : 'failed', printer_email_status: printerSent ? 'sent' : 'failed', error_message: errors || null, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', reservation.id)
    return NextResponse.json({ success: status === 'sent', status, paymentCount: payments.rows.length, paymentTotal: payments.total, pumpOutCount: pumpOuts.requests.length }, { status: status === 'failed' ? 502 : 200 })
  } catch (error: any) {
    await admin.from('scheduled_reports').update({ status: 'failed', error_message: String(error?.message || error).slice(0, 2000), completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', reservation.id)
    return NextResponse.json({ error: error?.message || 'Unable to send the morning office report.' }, { status: 500 })
  }
}
