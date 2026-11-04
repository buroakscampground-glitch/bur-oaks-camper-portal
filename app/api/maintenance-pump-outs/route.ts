import { NextResponse } from 'next/server'
import { isSystemPortalAccount } from '../../../lib/camper-records'
import { orderPumpOutWorkerStops, type PumpOutWorkerStop } from '../../../lib/pump-out-worker'
import { sendPumpOutCompletionText } from '../../../lib/pump-out-completion-alert'
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

  const stops = orderPumpOutWorkerStops(((data || []) as PumpOutWorkerStop[]).filter((row) => !isSystemPortalAccount(row)))
  return response({ success: true, stops })
}

export async function POST(request: Request) {
  const context = await authorizedContext(request)
  if (!context) return response({ success: false, error: 'Maintenance access required.' }, 403)

  const body = await request.json().catch(() => null)
  const requestId = String(body?.requestId || '').trim()
  if (!requestId) return response({ success: false, error: 'Pump-out request is required.' }, 400)

  const now = new Date().toISOString()
  const { data: completionData, error } = await context.admin.rpc('complete_sewer_pump_out_with_notification', {
    p_request_id: requestId,
    p_actor_email: context.user.email || 'Bur Oaks Staff',
  })

  if (error) {
    if (error.code === 'P0002') return response({ success: false, error: 'Pump-out request not found.' }, 404)
    if (error.code === '22023') return response({ success: false, error: 'This pump-out is no longer pending.' }, 409)
    return response({ success: false, error: 'The pump-out could not be completed safely.' }, 500)
  }

  const completion = Array.isArray(completionData) ? completionData[0] : completionData
  const stop = completion?.request_row
  if (!stop?.id) return response({ success: false, error: 'The saved completion could not be verified.' }, 500)

  if (completion?.duplicate) {
    return response({ success: true, duplicate: true, stop, message: 'This pump-out was already completed. No duplicate camper alert was sent.' })
  }

  const textSummary = await sendPumpOutCompletionText({
    client: context.admin,
    camperId: String(stop.camper_id || ''),
    requestId: String(stop.id),
    lotNumber: stop.lot_number,
    sentBy: context.user.email || 'Bur Oaks Staff',
  }).catch(() => ({
    status: 'failed' as const,
    sentCount: 0,
    failedCount: 1,
    skippedCount: 0,
    detail: 'The portal alert was saved, but the text delivery check failed.',
  }))

  await context.admin
    .from('admin_notifications')
    .update({ read_at: now })
    .eq('type', 'sewer_pump_out')
    .eq('source_id', requestId)
    .is('read_at', null)

  return response({
    success: true,
    stop,
    notification: {
      portalStatus: completion?.message_row?.id ? 'sent' : 'failed',
      messageId: completion?.message_row?.id || null,
      smsStatus: textSummary.status,
      smsSentCount: textSummary.sentCount,
      smsFailedCount: textSummary.failedCount,
      smsSkippedCount: textSummary.skippedCount,
    },
    message: `Pump-out completed. Camper portal alert saved. ${textSummary.detail} The charge remains queued for the next electric bill.`,
  })
}
