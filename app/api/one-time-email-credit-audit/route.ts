import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const oneTimeKey = 'email_audit_48d9e2a701'

async function safe(query: any) {
  try {
    const result = await query
    return { rows: result.data || [], error: result.error?.message || null }
  } catch (error: any) {
    return { rows: [], error: String(error?.message || error) }
  }
}

function creditFailure(error: unknown) {
  return /credit|quota|limit has been exceeded|maximum.*exceed|too many requests/i.test(String(error || ''))
}

export async function GET(request: Request) {
  if (request.headers.get('x-one-time-key') !== oneTimeKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: 'Production data is not configured.' }, { status: 500 })
  }

  const admin = createClient(supabaseUrl, serviceRoleKey)
  const since = '2026-08-01T00:00:00.000Z'
  const [notificationResult, inviteResult, eventResult, celebrationResult, reportResult] = await Promise.all([
    safe(admin
      .from('text_reminders')
      .select('id,camper_id,invoice_id,reminder_type,status,provider,recipient_email,error_message,sent_at,automation_key,campers(first_name,last_name,lot_number)')
      .not('recipient_email', 'is', null)
      .gte('sent_at', since)
      .order('sent_at', { ascending: false })
      .limit(2000)),
    safe(admin
      .from('portal_invite_log')
      .select('id,camper_id,email,delivery_status,delivery_provider,error_message,created_at,campers(first_name,last_name,lot_number)')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(1000)),
    safe(admin
      .from('event_reminder_deliveries')
      .select('id,event_id,camper_id,status,recipient,provider,error_message,created_at,updated_at,campers(first_name,last_name,lot_number)')
      .eq('channel', 'email')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(1000)),
    safe(admin
      .from('camper_celebration_deliveries')
      .select('id,camper_id,celebration_type,status,recipient,provider,error_message,created_at,updated_at,campers(first_name,last_name,lot_number)')
      .eq('channel', 'email')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(1000)),
    safe(admin
      .from('scheduled_reports')
      .select('id,report_key,report_date,status,office_email_status,printer_email_status,error_message,started_at,completed_at')
      .gte('report_date', '2026-08-01')
      .order('report_date', { ascending: false })
      .limit(300)),
  ])

  const successfulNotificationKeys = new Set(notificationResult.rows
    .filter((row: any) => String(row.status).toLowerCase() === 'sent')
    .map((row: any) => `${String(row.recipient_email || '').toLowerCase()}|${row.invoice_id || ''}|${row.reminder_type || ''}`))
  const successfulInviteEmails = new Set(inviteResult.rows
    .filter((row: any) => String(row.delivery_status).toLowerCase() === 'sent')
    .map((row: any) => String(row.email || '').toLowerCase()))

  const failures = [
    ...notificationResult.rows
      .filter((row: any) => String(row.status).toLowerCase() === 'failed')
      .map((row: any) => ({
        source: 'invoice/document email',
        id: row.id,
        lot: row.campers?.lot_number || '',
        camper: `${row.campers?.first_name || ''} ${row.campers?.last_name || ''}`.trim(),
        recipient: row.recipient_email || '',
        kind: row.reminder_type || 'Email',
        error: row.error_message || 'Delivery failed',
        date: row.sent_at,
        laterSuccess: successfulNotificationKeys.has(`${String(row.recipient_email || '').toLowerCase()}|${row.invoice_id || ''}|${row.reminder_type || ''}`),
      })),
    ...inviteResult.rows
      .filter((row: any) => String(row.delivery_status).toLowerCase() === 'failed')
      .map((row: any) => ({
        source: 'portal setup email',
        id: row.id,
        lot: row.campers?.lot_number || '',
        camper: `${row.campers?.first_name || ''} ${row.campers?.last_name || ''}`.trim(),
        recipient: row.email || '',
        kind: 'Portal setup link',
        error: row.error_message || 'Delivery failed',
        date: row.created_at,
        laterSuccess: successfulInviteEmails.has(String(row.email || '').toLowerCase()),
      })),
    ...eventResult.rows
      .filter((row: any) => String(row.status).toLowerCase() === 'failed')
      .map((row: any) => ({ source: 'event email', id: row.id, lot: row.campers?.lot_number || '', camper: `${row.campers?.first_name || ''} ${row.campers?.last_name || ''}`.trim(), recipient: row.recipient || '', kind: `Event ${row.event_id}`, error: row.error_message || 'Delivery failed', date: row.updated_at || row.created_at, laterSuccess: false })),
    ...celebrationResult.rows
      .filter((row: any) => String(row.status).toLowerCase() === 'failed')
      .map((row: any) => ({ source: 'celebration email', id: row.id, lot: row.campers?.lot_number || '', camper: `${row.campers?.first_name || ''} ${row.campers?.last_name || ''}`.trim(), recipient: row.recipient || '', kind: row.celebration_type || 'Celebration', error: row.error_message || 'Delivery failed', date: row.updated_at || row.created_at, laterSuccess: false })),
    ...reportResult.rows
      .filter((row: any) => ['failed', 'partial'].includes(String(row.status).toLowerCase()) || row.office_email_status === 'failed' || row.printer_email_status === 'failed')
      .map((row: any) => ({ source: 'scheduled report email', id: row.id, lot: '', camper: '', recipient: row.report_key || '', kind: row.report_key || 'Scheduled report', error: row.error_message || row.status, date: row.completed_at || row.started_at || row.report_date, laterSuccess: false })),
  ].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))

  const creditFailures = failures.filter((row) => creditFailure(row.error))
  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    since,
    totals: {
      allEmailFailures: failures.length,
      creditFailures: creditFailures.length,
      creditFailuresRecovered: creditFailures.filter((row) => row.laterSuccess).length,
      creditFailuresStillUnresolved: creditFailures.filter((row) => !row.laterSuccess).length,
    },
    creditFailures,
    otherFailures: failures.filter((row) => !creditFailure(row.error)),
    queryErrors: [notificationResult.error, inviteResult.error, eventResult.error, celebrationResult.error, reportResult.error].filter(Boolean),
  })
}
