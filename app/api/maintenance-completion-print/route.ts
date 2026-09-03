import { NextResponse } from 'next/server'
import { getAuthenticatedContext } from '../../../lib/server-auth'
import { printCompletedMaintenanceWorkOrder } from '../../../lib/maintenance-work-order-report'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const context = await getAuthenticatedContext(request)
  const role = String(context?.camper?.role || '').toLowerCase()
  if (!context || !['admin', 'maintenance'].includes(role)) {
    return NextResponse.json({ error: 'Only an admin or maintenance team member can print a completed work order.' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const ticketId = String(body?.ticketId || '').trim()
  if (!ticketId) return NextResponse.json({ error: 'A work order is required.' }, { status: 400 })

  try {
    const result = await printCompletedMaintenanceWorkOrder(context.admin, ticketId)
    return NextResponse.json({
      success: true,
      skipped: result.skipped,
      message: result.skipped
        ? result.reason
        : 'Completed work order sent to the first Epson printer for the office files.',
    })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'The completed work order could not be printed.' }, { status: 502 })
  }
}
