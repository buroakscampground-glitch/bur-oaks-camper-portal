import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { sendInvoiceEmail } from '../../../../lib/invoice-emailing'
import { daysUntilDate, sendInvoiceText, todayInCentral } from '../../../../lib/invoice-texting'

export const dynamic = 'force-dynamic'

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  'https://mzywctpxnpejglnspyqi.supabase.co'

function adminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) return null
  return createClient(supabaseUrl, serviceRoleKey)
}

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return request.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { error: 'Cron is not authorized. Add CRON_SECRET in Vercel before enabling automatic reminders.' },
      { status: 401 }
    )
  }

  const admin = adminClient()
  if (!admin) {
    return NextResponse.json({ error: 'Supabase service key is not configured.' }, { status: 500 })
  }

  const today = todayInCentral()
  const { data: invoices, error } = await admin
    .from('invoices')
    .select('id,due_date,status,total_due,late_fee')
    .neq('status', 'paid')
    .neq('status', 'processing')
    .gt('total_due', 0)
    .not('due_date', 'is', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const invoiceIds = (invoices || []).map((invoice) => invoice.id)
  const { data: lateFeeNotices, error: lateFeeNoticeError } = invoiceIds.length
    ? await admin
        .from('text_reminders')
        .select('invoice_id,automation_key,status')
        .in('invoice_id', invoiceIds)
        .in('automation_key', ['invoice-late-fee', 'invoice-late-fee-email'])
        .eq('status', 'sent')
    : { data: [], error: null }

  if (lateFeeNoticeError) {
    return NextResponse.json({ error: lateFeeNoticeError.message }, { status: 500 })
  }

  const lateFeeEmailSent = new Set(
    (lateFeeNotices || [])
      .filter((notice) => notice.automation_key === 'invoice-late-fee-email')
      .map((notice) => notice.invoice_id)
  )
  const lateFeeTextSent = new Set(
    (lateFeeNotices || [])
      .filter((notice) => notice.automation_key === 'invoice-late-fee')
      .map((notice) => notice.invoice_id)
  )

  const summary = {
    checked: invoices?.length || 0,
    textSent: 0,
    emailSent: 0,
    lateFeesApplied: 0,
    skipped: 0,
    failed: 0,
    results: [] as any[],
  }

  for (const invoice of invoices || []) {
    const daysUntilDue = daysUntilDate(String(invoice.due_date), today)

    if (daysUntilDue <= -6 && !lateFeeEmailSent.has(invoice.id)) {
      let lateFee = Number(invoice.late_fee || 0)
      let updatedTotal = Number(invoice.total_due || 0)

      if (lateFee <= 0) {
        const unpaidBalance = Math.round(updatedTotal * 100) / 100
        lateFee = Math.max(20, Math.round(unpaidBalance * 20) / 100)
        updatedTotal = Math.round((unpaidBalance + lateFee) * 100) / 100

        const { data: updatedInvoice, error: updateError } = await admin
          .from('invoices')
          .update({ late_fee: lateFee, total_due: updatedTotal })
          .eq('id', invoice.id)
          .eq('total_due', invoice.total_due)
          .neq('status', 'paid')
          .neq('status', 'processing')
          .or('late_fee.is.null,late_fee.eq.0')
          .select('id,late_fee,total_due')
          .maybeSingle()

        if (updateError) {
          summary.failed += 1
          summary.results.push({
            invoiceId: invoice.id,
            dueDate: invoice.due_date,
            kind: 'late_fee',
            error: updateError.message,
          })
          continue
        }

        if (!updatedInvoice) {
          summary.skipped += 1
          continue
        }

        lateFee = Number(updatedInvoice.late_fee || lateFee)
        updatedTotal = Number(updatedInvoice.total_due || updatedTotal)
        summary.lateFeesApplied += 1
      }

      const [textResult, emailResult] = await Promise.all([
        lateFeeTextSent.has(invoice.id)
          ? Promise.resolve({ status: 'skipped', reason: 'The late-fee text was already sent.' })
          : sendInvoiceText({
              client: admin,
              invoiceId: invoice.id,
              kind: 'late_fee',
              automationKey: 'invoice-late-fee',
              reminderDate: today,
              sentBy: 'invoice-reminder-cron',
            }),
        sendInvoiceEmail({
          client: admin,
          invoiceId: invoice.id,
          kind: 'late_fee',
          automationKey: 'invoice-late-fee-email',
          reminderDate: today,
          sentBy: 'invoice-reminder-cron',
        }),
      ])

      if (textResult.status === 'sent') summary.textSent += 1
      else if (textResult.status === 'failed') summary.failed += 1
      else summary.skipped += 1

      if (emailResult.status === 'sent') summary.emailSent += 1
      else if (emailResult.status === 'failed') summary.failed += 1
      else summary.skipped += 1

      summary.results.push({
        invoiceId: invoice.id,
        dueDate: invoice.due_date,
        kind: 'late_fee',
        lateFee,
        updatedTotal,
        text: textResult,
        email: emailResult,
      })
      continue
    }

    let kind: 'due_3_days' | 'due_1_day' | 'due_today' | 'past_due' | null = null
    let automationKey = ''
    let emailAutomationKey = ''

    if (daysUntilDue === 3) {
      kind = 'due_3_days'
      automationKey = 'invoice-due-3'
      emailAutomationKey = 'invoice-due-3-email'
    } else if (daysUntilDue === 1) {
      kind = 'due_1_day'
      automationKey = 'invoice-due-1'
      emailAutomationKey = 'invoice-due-1-email'
    } else if (daysUntilDue === 0) {
      kind = 'due_today'
      automationKey = 'invoice-due-today'
      emailAutomationKey = 'invoice-due-today-email'
    } else if (
      daysUntilDue < 0 &&
      ([1, 7, 14, 30].includes(Math.abs(daysUntilDue)) || (Math.abs(daysUntilDue) > 30 && Math.abs(daysUntilDue) % 30 === 0))
    ) {
      kind = 'past_due'
      automationKey = 'invoice-past-due'
      emailAutomationKey = 'invoice-past-due-email'
    }

    if (!kind) continue

    const [textResult, emailResult] = await Promise.all([
      sendInvoiceText({
        client: admin,
        invoiceId: invoice.id,
        kind,
        automationKey,
        reminderDate: today,
        sentBy: 'invoice-reminder-cron',
      }),
      sendInvoiceEmail({
        client: admin,
        invoiceId: invoice.id,
        kind,
        automationKey: emailAutomationKey,
        reminderDate: today,
        sentBy: 'invoice-reminder-cron',
      }),
    ])

    if (textResult.status === 'sent') summary.textSent += 1
    else if (textResult.status === 'failed') summary.failed += 1
    else summary.skipped += 1

    if (emailResult.status === 'sent') summary.emailSent += 1
    else if (emailResult.status === 'failed') summary.failed += 1
    else summary.skipped += 1

    summary.results.push({
      invoiceId: invoice.id,
      dueDate: invoice.due_date,
      kind,
      text: {
        status: textResult.status,
        reason: 'reason' in textResult ? textResult.reason : undefined,
        error: 'error' in textResult ? textResult.error : undefined,
      },
      email: {
        status: emailResult.status,
        reason: 'reason' in emailResult ? emailResult.reason : undefined,
        error: 'error' in emailResult ? emailResult.error : undefined,
      },
    })
  }

  return NextResponse.json({ success: true, today, ...summary })
}
