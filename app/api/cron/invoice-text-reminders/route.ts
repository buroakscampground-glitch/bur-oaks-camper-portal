import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { sendInvoiceEmail } from '../../../../lib/invoice-emailing'
import { daysUntilDate, sendInvoiceText, todayInCentral } from '../../../../lib/invoice-texting'
import {
  LATE_FEE_ASSESSMENT_DAY,
  LATE_FEE_WARNING_DAY,
  pastDueReminderMilestone,
  scheduledInvoiceNoticeKind,
  shouldAssessLateFee,
} from '../../../../lib/invoice-reminder-schedule'

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

function warningWasAlreadyDeliveredOrHasNoRecipient(result: any) {
  if (result?.status !== 'skipped') return false
  const reason = String(result?.reason || '')
  return reason.startsWith('Every eligible phone already received') || reason.startsWith('No opted-in phone numbers')
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
    const daysPastDue = Math.max(0, -daysUntilDue)
    let lateFeeWarningCompletedBeforeToday = Number(invoice.late_fee || 0) > 0

    if (daysPastDue >= LATE_FEE_WARNING_DAY && Number(invoice.late_fee || 0) <= 0) {
      const [warningText, warningEmail] = await Promise.all([
        sendInvoiceText({
          client: admin,
          invoiceId: invoice.id,
          kind: 'late_fee_warning',
          automationKey: 'invoice-late-fee-warning',
          reminderDate: today,
          sentBy: 'invoice-reminder-cron',
        }),
        sendInvoiceEmail({
          client: admin,
          invoiceId: invoice.id,
          kind: 'late_fee_warning',
          automationKey: 'invoice-late-fee-warning-email',
          reminderDate: today,
          sentBy: 'invoice-reminder-cron',
        }),
      ])

      if (warningText.status === 'sent') summary.textSent += 1
      else if (warningText.status === 'failed') summary.failed += 1
      else summary.skipped += 1
      if (warningEmail.status === 'sent') summary.emailSent += 1
      else if (warningEmail.status === 'failed') summary.failed += 1
      else summary.skipped += 1

      summary.results.push({
        invoiceId: invoice.id,
        dueDate: invoice.due_date,
        kind: 'late_fee_warning',
        daysPastDue,
        text: warningText,
        email: warningEmail,
      })

      const warningCompletedBeforeToday = warningWasAlreadyDeliveredOrHasNoRecipient(warningText)
      lateFeeWarningCompletedBeforeToday = warningCompletedBeforeToday
      if (daysPastDue === LATE_FEE_WARNING_DAY || !warningCompletedBeforeToday) {
        continue
      }
    }

    if (
      daysPastDue >= LATE_FEE_ASSESSMENT_DAY &&
      (Number(invoice.late_fee || 0) > 0 || shouldAssessLateFee(daysPastDue, lateFeeWarningCompletedBeforeToday))
    ) {
      let lateFee = Number(invoice.late_fee || 0)
      let updatedTotal = Number(invoice.total_due || 0)
      let lateFeeAppliedNow = false

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
        lateFeeAppliedNow = true
      }

      const [textResult, emailResult] = await Promise.all([
        sendInvoiceText({
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
      const lateFeeStageNeededWork = lateFeeAppliedNow || textResult.status !== 'skipped' || emailResult.status !== 'skipped'
      if (lateFeeStageNeededWork) continue
    }

    const kind = scheduledInvoiceNoticeKind(daysUntilDue)
    if (!kind) continue
    const automationKey = kind === 'upcoming'
      ? 'invoice-upcoming'
      : kind === 'due_3_days'
        ? 'invoice-due-3'
        : kind === 'due_1_day'
          ? 'invoice-due-1'
          : kind === 'due_today'
            ? 'invoice-due-today'
            : `invoice-past-due-${pastDueReminderMilestone(Math.abs(daysUntilDue)) || 1}`
    const emailAutomationKey = `${automationKey}-email`

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
