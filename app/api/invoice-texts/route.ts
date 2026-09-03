import { NextResponse } from 'next/server'
import { getAuthenticatedContext } from '../../../lib/server-auth'
import { sendInvoiceEmail } from '../../../lib/invoice-emailing'
import { sendInvoiceText, todayInCentral } from '../../../lib/invoice-texting'
import { creationInvoiceNoticeKind, daysUntilDate, pastDueReminderMilestone } from '../../../lib/invoice-reminder-schedule'

async function requireAdmin(request: Request) {
  const context = await getAuthenticatedContext(request)

  if (!context || String(context.camper.role || '').toLowerCase() !== 'admin') {
    return null
  }

  return context
}

export async function POST(request: Request) {
  const context = await requireAdmin(request)
  if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const invoiceId = String(body.invoiceId || '')

  if (!invoiceId) {
    return NextResponse.json({ error: 'Missing invoice id.' }, { status: 400 })
  }

  const today = todayInCentral()
  const { data: invoice, error: invoiceError } = await context.admin
    .from('invoices')
    .select('id,due_date,status,total_due')
    .eq('id', invoiceId)
    .maybeSingle()

  if (invoiceError || !invoice) {
    return NextResponse.json({ error: invoiceError?.message || 'Invoice was not found.' }, { status: 404 })
  }

  const noticeKind = creationInvoiceNoticeKind(invoice.due_date, today)
  if (!noticeKind) {
    const daysUntilDue = daysUntilDate(String(invoice.due_date), today)
    const reason = `No notice sent now. The first notice is scheduled for 30 days before the ${invoice.due_date} due date.`
    return NextResponse.json({
      success: true,
      result: {
        scheduled: true,
        daysUntilDue,
        firstNoticeDate: new Date(Date.UTC(
          Number(String(invoice.due_date).slice(0, 4)),
          Number(String(invoice.due_date).slice(5, 7)) - 1,
          Number(String(invoice.due_date).slice(8, 10)) - 30,
        )).toISOString().slice(0, 10),
        text: { status: 'skipped', reason },
        email: { status: 'skipped', reason },
      },
    })
  }

  const daysUntilDue = invoice.due_date ? daysUntilDate(String(invoice.due_date), today) : 0
  const automationKey = noticeKind === 'upcoming'
    ? 'invoice-upcoming'
    : noticeKind === 'past_due'
      ? `invoice-past-due-${pastDueReminderMilestone(Math.abs(daysUntilDue)) || 1}`
      : 'invoice-new'
  const [textResult, emailResult] = await Promise.all([
    sendInvoiceText({
      client: context.admin,
      invoiceId,
      kind: noticeKind,
      automationKey,
      reminderDate: today,
      sentBy: context.user.email || 'office',
    }),
    sendInvoiceEmail({
      client: context.admin,
      invoiceId,
      kind: noticeKind,
      automationKey: `${automationKey}-email`,
      reminderDate: today,
      sentBy: context.user.email || 'office',
    }),
  ])

  const hasFailure = textResult.status === 'failed' || emailResult.status === 'failed'

  return NextResponse.json({
    success: !hasFailure,
    result: {
      text: textResult,
      email: emailResult,
    },
  })
}
