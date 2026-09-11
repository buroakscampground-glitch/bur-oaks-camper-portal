import { NextResponse } from 'next/server'
import { isSystemPortalAccount } from '../../../lib/camper-records'
import { orderPumpOutWorkerStops } from '../../../lib/pump-out-worker'
import { getAuthenticatedContext } from '../../../lib/server-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function response(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  })
}

async function authorizedContext(request: Request) {
  const context = await getAuthenticatedContext(request)
  if (!context || !['admin', 'maintenance'].includes(context.camper.role)) return null
  return context
}

const stopFields = 'id,camper_id,lot_number,camper_name,status,charge_amount,gallons_used,notes,requested_at,completed_at,billed_at,updated_at'

export async function GET(request: Request) {
  const context = await authorizedContext(request)
  if (!context) return response({ success: false, error: 'Maintenance access required.' }, 403)

  const { data, error } = await context.admin
    .from('sewer_pump_out_requests')
    .select(stopFields)
    .eq('status', 'requested')
    .is('billed_at', null)
    .order('requested_at', { ascending: true })
    .limit(250)

  if (error) return response({ success: false, error: error.message }, 500)

  const stops = orderPumpOutWorkerStops((data || []).filter((row: any) => !isSystemPortalAccount(row)))
  return response({ success: true, stops })
}

export async function POST(request: Request) {
  const context = await authorizedContext(request)
  if (!context) return response({ success: false, error: 'Maintenance access required.' }, 403)

  const body = await request.json().catch(() => null)
  const requestId = String(body?.requestId || '').trim()
  if (!requestId) return response({ success: false, error: 'Pump-out request is required.' }, 400)

  const now = new Date().toISOString()
  const { data, error } = await context.admin
    .from('sewer_pump_out_requests')
    .update({ status: 'completed', completed_at: now, updated_at: now })
    .eq('id', requestId)
    .eq('status', 'requested')
    .is('billed_at', null)
    .select(stopFields)
    .maybeSingle()

  if (error) return response({ success: false, error: error.message }, 500)

  if (!data) {
    const { data: existing, error: lookupError } = await context.admin
      .from('sewer_pump_out_requests')
      .select(stopFields)
      .eq('id', requestId)
      .maybeSingle()

    if (lookupError) return response({ success: false, error: lookupError.message }, 500)
    if (!existing) return response({ success: false, error: 'Pump-out request not found.' }, 404)
    if (existing.status === 'completed') {
      return response({ success: true, duplicate: true, stop: existing, message: 'This pump-out was already completed.' })
    }
    return response({ success: false, error: 'This pump-out is no longer pending.' }, 409)
  }

  await context.admin
    .from('admin_notifications')
    .update({ read_at: now })
    .eq('type', 'sewer_pump_out')
    .eq('source_id', requestId)
    .is('read_at', null)

  return response({
    success: true,
    stop: data,
    message: 'Pump-out completed. Its charge remains queued for the next electric bill.',
  })
}
