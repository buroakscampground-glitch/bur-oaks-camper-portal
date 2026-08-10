import { NextResponse } from 'next/server'
import { getAuthenticatedContext } from '../../../lib/server-auth'
import { sendMaintenanceWorkOrderReport } from '../../../lib/maintenance-work-order-report'

export const runtime = 'nodejs'

function todayInCentral() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date())
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || ''
  return `${value('year')}-${value('month')}-${value('day')}`
}

export async function POST(request: Request) {
  const context = await getAuthenticatedContext(request)
  if (!context || String(context.camper.role || '').toLowerCase() !== 'admin') {
    return NextResponse.json({ error: 'Only an admin can send the work-order packet.' }, { status: 403 })
  }

  try {
    const result = await sendMaintenanceWorkOrderReport(context.admin, todayInCentral())
    if (result.skipped) {
      return NextResponse.json({ success: true, skipped: true, itemCount: 0, message: 'No active approved work orders to print.' })
    }

    const success = Boolean(result.office?.sent && result.printer?.sent)
    return NextResponse.json({
      success,
      itemCount: result.orders.length,
      office: result.office,
      printer: result.printer,
      message: success
        ? `Sent ${result.orders.length} active work order${result.orders.length === 1 ? '' : 's'} to Gmail and the Epson printer.`
        : `The packet was created, but one or more deliveries failed. Gmail: ${result.office?.sent ? 'sent' : result.office?.error}. Printer: ${result.printer?.sent ? 'sent' : result.printer?.error}.`,
    }, { status: success ? 200 : 502 })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Unable to create the work-order packet.' }, { status: 500 })
  }
}
