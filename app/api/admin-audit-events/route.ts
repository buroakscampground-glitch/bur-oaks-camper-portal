import { NextResponse } from 'next/server'
import { getAuthenticatedContext } from '../../../lib/server-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const context = await getAuthenticatedContext(request)
  if (!context || String(context.camper.role || '').toLowerCase() !== 'admin') {
    return NextResponse.json({ error: 'Admin access is required.' }, { status: 401 })
  }
  const params = new URL(request.url).searchParams
  const requestedLimit = Number(params.get('limit') || 300)
  const limit = Math.min(500, Math.max(25, Number.isFinite(requestedLimit) ? Math.floor(requestedLimit) : 300))
  const { data: events, error } = await context.admin.from('admin_audit_events')
    .select('id,action,camper_id,lot_number,entity_type,entity_id,reason,actor_email,before_state,after_state,created_at')
    .order('created_at', { ascending: false }).limit(limit)
  if (error) return NextResponse.json({ error: error.message || 'The office audit trail could not be loaded.' }, { status: 500 })

  const camperIds = [...new Set((events || []).map((event) => event.camper_id).filter(Boolean))]
  const camperResult = camperIds.length
    ? await context.admin.from('campers').select('id,first_name,last_name,lot_number').in('id', camperIds)
    : { data: [], error: null }
  if (camperResult.error) return NextResponse.json({ error: camperResult.error.message || 'Camper names could not be matched to the audit trail.' }, { status: 500 })
  const campers = new Map((camperResult.data || []).map((camper) => [camper.id, camper]))
  const rows = (events || []).map((event) => ({ ...event, camper: event.camper_id ? campers.get(event.camper_id) || null : null }))
  return NextResponse.json({
    events: rows,
    summary: {
      totalLoaded: rows.length,
      actors: new Set(rows.map((event) => event.actor_email)).size,
      campsites: new Set(rows.map((event) => event.camper_id).filter(Boolean)).size,
      financial: rows.filter((event) => ['manual_payment_recorded','late_fee_waived','invoice_deleted','account_credit_created','account_credit_voided','camper_rent_terms_updated'].includes(event.action)).length,
    },
  }, { headers: { 'Cache-Control': 'no-store' } })
}
