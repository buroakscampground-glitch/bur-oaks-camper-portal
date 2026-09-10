import { NextResponse } from 'next/server'
import { requiresAdminAttention } from '../../../lib/admin-notification-types'
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
    siteCareResult,
    pumpOutResult,
  ] = await Promise.all([
    context.admin.from('admin_notifications').select('id,type').is('read_at', null),
    context.admin.from('office_messages').select('id').eq('sender_role', 'camper').is('read_by_admin_at', null),
    context.admin.from('invoices').select('id,due_date,status'),
    context.admin.from('documents').select('id,signature_status'),
    context.admin.from('maintenance_tickets').select('id,status'),
    context.admin.from('maintenance_supply_requests').select('id,status').in('status', ['Requested', 'Ordered']),
    context.admin.from('site_care_notices').select('id,status').neq('status', 'Resolved'),
    context.admin.from('sewer_pump_out_requests').select('id,status,requested_at,completed_at,billed_at'),
  ])

  const results = [notificationResult, messageResult, invoiceResult, documentResult, maintenanceResult, supplyResult, siteCareResult, pumpOutResult]
  const error = results.find((result) => result.error)?.error
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const notifications = notificationResult.data || []
  const workflowNotificationTypes = new Set(['maintenance_request', 'direct_message', 'site_care'])
  const standaloneNotifications = notifications.filter((item: any) =>
    requiresAdminAttention(item.type) && !workflowNotificationTypes.has(String(item.type || ''))
  ).length
  const counts: Record<string, number> = {
    '/admin/notifications': notifications.filter((item: any) => item.type !== 'event_rsvp' && requiresAdminAttention(item.type)).length,
    '/admin/messages': (messageResult.data || []).length,
    '/admin/open-balance': (invoiceResult.data || []).filter((item: any) => isOpen(item.status)).length,
    // Unsigned documents stay prominent on the admin dashboard, but they are
    // camper action items and should not create an admin badge.
    '/admin/documents': 0,
    '/admin/waitlist': notifications.filter((item: any) => item.type === 'website_waitlist').length,
    '/admin/maintenance': (maintenanceResult.data || []).filter((item: any) => isOpen(item.status)).length,
    '/admin/maintenance/supplies': (supplyResult.data || []).length,
    '/admin/pump-outs': (pumpOutResult.data || []).filter(isPumpOutWaitingForService).length,
    '/admin/site-care': (siteCareResult.data || []).length,
  }
  const appBadgeCount = standaloneNotifications
    + counts['/admin/messages']
    + counts['/admin/maintenance']
    + counts['/admin/maintenance/supplies']
    + counts['/admin/pump-outs']
    + counts['/admin/site-care']

  return NextResponse.json({ counts, appBadgeCount }, { headers: { 'Cache-Control': 'no-store' } })
}
