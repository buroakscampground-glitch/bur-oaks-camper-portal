import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mzywctpxnpejglnspyqi.supabase.co'
const renewalTypes = ['renewal_review', 'nonrenewal_letter_review', 'renewal_declined', 'renewal_document_incomplete', 'renewal_rent_schedule', 'renewal_rent_schedule_error']

async function candidates() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('Service key unavailable.')
  const admin = createClient(supabaseUrl, key)
  const [notificationResult, renewalResult, camperResult] = await Promise.all([
    admin.from('admin_notifications').select('id,type,title,camper_id,lot_number,created_at,read_at,source_id').in('type', renewalTypes).order('created_at', { ascending: false }).limit(50),
    admin.from('season_renewals').select('id,camper_id,status,auto_send_approved,renewal_sent_at,review_notified_at,contract_end_date'),
    admin.from('campers').select('id,first_name,last_name,lot_number'),
  ])
  const error = notificationResult.error || renewalResult.error || camperResult.error
  if (error) throw error

  const renewals = new Map((renewalResult.data || []).map((row) => [String(row.id), row]))
  const campers = new Map((camperResult.data || []).map((row) => [String(row.id), row]))
  const rows = (notificationResult.data || []).flatMap((notification) => {
    const renewal = renewals.get(String(notification.source_id || ''))
    if (notification.type !== 'renewal_review' || !notification.read_at || !renewal || renewal.status !== 'Not Started' || renewal.auto_send_approved || renewal.renewal_sent_at) return []
    const camper = campers.get(String(notification.camper_id || ''))
    return [{
      id: notification.id,
      title: notification.title,
      camperId: notification.camper_id,
      lot: notification.lot_number || camper?.lot_number || null,
      camper: camper ? `${camper.first_name || ''} ${camper.last_name || ''}`.trim() : 'Unknown camper',
      createdAt: notification.created_at,
      readAt: notification.read_at,
      renewal,
    }]
  })
  return { admin, rows, allNotifications: notificationResult.data || [] }
}

export async function GET() {
  try {
    const { rows, allNotifications } = await candidates()
    return NextResponse.json({ generatedAt: new Date().toISOString(), candidates: rows, allNotifications }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Audit failed.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const requested = Array.isArray(body.ids) ? body.ids.map(String).slice(0, 2) : []
    const { admin, rows } = await candidates()
    const allowed = new Set(rows.map((row) => String(row.id)))
    const ids = requested.filter((id: string) => allowed.has(id))
    if (!ids.length) return NextResponse.json({ error: 'No matching false-cleared renewal alerts.' }, { status: 400 })
    const { error } = await admin.from('admin_notifications').update({ read_at: null }).in('id', ids).eq('type', 'renewal_review')
    if (error) throw error
    return NextResponse.json({ success: true, restored: rows.filter((row) => ids.includes(String(row.id))) })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Repair failed.' }, { status: 500 })
  }
}
