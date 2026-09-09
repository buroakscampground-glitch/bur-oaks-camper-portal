import { NextResponse } from 'next/server'
import { isPumpOutWaitingForService } from '../../../lib/pump-out-status'
import { getAuthenticatedContext } from '../../../lib/server-auth'

function isOpen(status: unknown) {
  return !['paid', 'cancelled', 'canceled', 'void', 'refunded', 'completed', 'closed', 'resolved'].includes(String(status || '').toLowerCase())
}

export async function GET(request: Request) {
  const context = await getAuthenticatedContext(request)
  if (!context || String(context.camper.role || '').toLowerCase() !== 'admin') {
    return NextResponse.json({ error: 'Admin access is required.' }, { status: 401 })
  }

  const [
    notificationResult,
    messageResult,
    invoiceResult,
    documentResult,
    maintenanceResult,
    supplyResult,
    pumpResult,
    siteCareResult,
  ] = await Promise.all([
    context.admin.from('admin_notifications').select('id,type').is('read_at', null),
    context.admin.from('office_messages').select('id').eq('sender_role', 'camper').is('read_by_admin_at', null),
    context.admin.from('invoices').select('id,due_date,status'),
    context.admin.from('documents').select('id,signature_status'),
    context.admin.from('maintenance_tickets').select('id,status'),
    context.admin.from('maintenance_supply_requests').select('id,status').in('status', ['Requested', 'Ordered']),
    context.admin.from('sewer_pump_out_requests').select('id,status,billed_at,completed_at'),
    context.admin.from('site_care_notices').select('id,status').neq('status', 'Resolved'),
  ])

  const results = [notificationResult, messageResult, invoiceResult, documentResult, maintenanceResult, supplyResult, pumpResult, siteCareResult]
  const error = results.find((result) => result.error)?.error
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const notifications = notificationResult.data || []
  const counts: Record<string, number> = {
    '/admin/notifications': notifications.filter((item: any) => item.type !== 'event_rsvp').length,
    '/admin/messages': (messageResult.data || []).length,
    '/admin/open-balance': (invoiceResult.data || []).filter((item: any) => isOpen(item.status)).length,
    '/admin/documents': (documentResult.data || []).filter((item: any) => !['signed', 'not_required', 'declined'].includes(String(item.signature_status || '').toLowerCase())).length,
    '/admin/maintenance': (maintenanceResult.data || []).filter((item: any) => isOpen(item.status)).length,
    '/admin/maintenance/supplies': (supplyResult.data || []).length,
    '/admin/pump-outs': (pumpResult.data || []).filter(isPumpOutWaitingForService).length,
    '/admin/site-care': (siteCareResult.data || []).length,
  }

  return NextResponse.json({ counts }, { headers: { 'Cache-Control': 'no-store' } })
}
