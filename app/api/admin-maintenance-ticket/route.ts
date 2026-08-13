import { NextResponse } from 'next/server'
import { getAuthenticatedContext } from '../../../lib/server-auth'
import { formatSmsPhone, sendTwilioSms } from '../../../lib/twilio-sms'
import { sendMaintenanceWorkOrderReport } from '../../../lib/maintenance-work-order-report'

export const runtime = 'nodejs'

const maintenanceAlertPhone = formatSmsPhone(
  process.env.MAINTENANCE_ALERT_PHONE || '314-713-6100'
)

function cleanText(value: unknown, maxLength: number) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
}

function todayInCentral() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date())
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || ''
  return `${value('year')}-${value('month')}-${value('day')}`
}

export async function POST(request: Request) {
  const context = await getAuthenticatedContext(request)

  if (!context) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  if (String(context.camper.role || '').toLowerCase() !== 'admin') {
    return NextResponse.json(
      { error: 'Only an admin can create an approved maintenance work order.' },
      { status: 403 }
    )
  }

  const body = await request.json().catch(() => ({}))
  const title = cleanText(body.title, 180)
  const description = cleanText(body.description, 2000)
  const category = cleanText(body.category, 80) || 'General'
  const priority = cleanText(body.priority, 40) || 'Normal'
  const assignedTo = cleanText(body.assignedTo, 120) || 'Open'
  const lotNumber = cleanText(body.lotNumber, 40)
  const reportedBy = cleanText(body.reportedBy, 120) || 'Bur Oaks Admin'
  const approvedBy = context.user.email || 'Admin'

  if (!title) {
    return NextResponse.json({ error: 'Please add a ticket title.' }, { status: 400 })
  }

  const now = new Date().toISOString()
  const { data: ticket, error } = await context.admin
    .from('maintenance_tickets')
    .insert({
      title,
      description,
      category,
      priority,
      assigned_to: assignedTo,
      lot_number: lotNumber,
      reported_by: reportedBy,
      status: 'Open',
      work_order: true,
      admin_approved: true,
      approved_at: now,
      approved_by: approvedBy,
    })
    .select('*')
    .single()

  if (error || !ticket) {
    return NextResponse.json(
      { error: error?.message || 'Unable to create this maintenance ticket.' },
      { status: 500 }
    )
  }

  const location = lotNumber ? `Lot ${lotNumber}` : category
  const message = [
    `Bur Oaks Campground maintenance: New admin work order - ${title}.`,
    `${location}. Priority: ${priority}.`,
    'Sign in: https://www.buroakscampground.com/maintenance/dashboard',
    'Reply STOP to opt out.',
  ].join(' ')

  const smsResult = maintenanceAlertPhone
    ? await sendTwilioSms({ to: maintenanceAlertPhone, body: message })
    : { sent: false, error: 'The maintenance alert phone number is not valid.' }

  const printResult = await sendMaintenanceWorkOrderReport(context.admin, todayInCentral(), [String(ticket.id)])
    .catch((printError: any) => ({
      skipped: false,
      office: null,
      printer: { sent: false, error: printError?.message || 'Automatic printing failed.' },
    }))

  return NextResponse.json({
    success: true,
    ticketId: ticket.id,
    smsStatus: smsResult.sent ? 'sent' : 'failed',
    smsMessage: smsResult.sent
      ? 'Maintenance text alert sent.'
      : smsResult.error,
    printStatus: printResult.printer?.sent ? 'sent' : 'failed',
    printMessage: printResult.printer?.sent
      ? 'Work order sent automatically to the Epson printer.'
      : printResult.printer?.error || 'The work order is saved and will retry in the morning packet.',
  })
}
