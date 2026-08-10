import { NextResponse } from 'next/server'
import { getAuthenticatedContext } from '../../../lib/server-auth'
import { sendPumpOutReport } from '../../../lib/pump-out-report'

export const runtime = 'nodejs'

function todayInCentral() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date())
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || ''
  return `${value('year')}-${value('month')}-${value('day')}`
}

export async function POST(request: Request) {
  const context = await getAuthenticatedContext(request)
  if (!context || String(context.camper.role || '').toLowerCase() !== 'admin') {
    return NextResponse.json({ error: 'Only an admin can send the pump-out report.' }, { status: 403 })
  }

  try {
    const reportDate = todayInCentral()
    const result = await sendPumpOutReport(context.admin, reportDate)
    const success = result.office.sent && result.printer.sent
    return NextResponse.json({
      success,
      reportDate,
      itemCount: result.requests.length,
      office: result.office,
      printer: result.printer,
      message: success
        ? `Pump-out list sent to Gmail and the Epson printer (${result.requests.length} active item${result.requests.length === 1 ? '' : 's'}).`
        : `The list was created, but one or more deliveries failed. Gmail: ${result.office.sent ? 'sent' : result.office.error}. Printer: ${result.printer.sent ? 'sent' : result.printer.error}.`,
    }, { status: success ? 200 : 502 })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Unable to create the pump-out report.' }, { status: 500 })
  }
}
