import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { withCronFailureAlert } from '../../../../lib/cron-failure-alert'
import { sendInvoiceEmail } from '../../../../lib/invoice-emailing'
import { daysUntilDate, sendInvoiceText, todayInCentral } from '../../../../lib/invoice-texting'
import {
  LATE_FEE_ASSESSMENT_DAY,
  LATE_FEE_WARNING_DAY,
  pastDueReminderMilestone,
  scheduledInvoiceNoticeKind,
  shouldAssessLateFee,
} from '../../../../lib/invoice-reminder-schedule'
import { isInvoiceOutstanding } from '../../../../lib/invoice-balance'
import { isInvoiceReadyForAccountCredit } from '../../../../lib/due-account-credits'

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

async function runCron(request: Request) {
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
    .select('id,camper_id,due_date,status,total_due,late_fee')
    .neq('status', 'paid')
    .neq('status', 'processing')
    .gt('total_due', 0)
    .not('due_date', 'is', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const camperIds = Array.from(new Set((invoices || []).map((invoice) => String(invoice.camper_id || '')).filter(Boolean)))
  const { data: activeCredits, error: activeCreditError } = camperIds.length
    ? await admin
      .from('account_credits')
      .select('camper_id,remaining_amount')
      .in('camper_id', camperIds)
      .eq('status', 'active')
      .gt('remaining_amount', 0)
    : { data: [], error: null }

  if (activeCreditError && !['42P01', 'PGRST205'].includes(activeCreditError.code || '')) {
    return NextResponse.json({ error: activeCreditError.message }, { status: 500 })
  }
  const availableCreditByCamper = new Map<string, number>()
  for (const credit of activeCredits || []) {
    const camperId = String(credit.camper_id || '')
    availableCreditByCamper.set(camperId, (availableCreditByCamper.get(camperId) || 0) + Number(credit.remaining_amount || 0))
  }

  const creditSummary = {
    checked: 0,
    applied: 0,
    fullyPaid: 0,
    partiallyPaid: 0,
    amountApplied: 0,
    failed: 0,
    results: [] as any[],
  }

  for (const invoice of invoices || []) {
    if (!isInvoiceReadyForAccountCredit(invoice, today)) continue
    creditSummary.checked += 1
    const { data: creditResult, error: creditError } = await admin.rpc('apply_account_credits_to_invoice_atomic', {
      p_camper_id: invoice.camper_id,
      p_invoice_id: invoice.id,
      p_invoice_total: invoice.total_due,
      p_applied_by: 'invoice-reminder-cron',
    })

    if (creditError) {
      creditSummary.failed += 1
      creditSummary.results.push({ invoiceId: invoice.id, error: creditError.message })
      continue
    }

    const appliedTotal = Number(creditResult?.appliedTotal || 0)
    const remainingDue = Number(creditResult?.remainingDue ?? invoice.total_due ?? 0)
    const paidInFull = creditResult?.paidInFull === true
    if (appliedTotal <= 0) continue

    const camperId = String(invoice.camper_id || '')
    availableCreditByCamper.set(
      camperId,
      Math.max(0, Number(((availableCreditByCamper.get(camperId) || 0) - appliedTotal).toFixed(2)))
    )
    creditSummary.applied += 1
    creditSummary.amountApplied += appliedTotal
    if (paidInFull) creditSummary.fullyPaid += 1
    else creditSummary.partiallyPaid += 1
    invoice.total_due = remainingDue
    invoice.status = paidInFull ? 'paid' : invoice.status
    creditSummary.results.push({ invoiceId: invoice.id, appliedTotal, remainingDue, paidInFull })
  }

  const openInvoices = (invoices || []).filter(isInvoiceOutstanding)
  const invoiceIds = openInvoices.map((invoice) => invoice.id)
  const { data: waiverRows, error: waiverError } = invoiceIds.length
    ? await admin
      .from('text_reminders')
      .select('invoice_id')
      .in('invoice_id', invoiceIds)
      .eq('automation_key', 'invoice-late-fee-waived')
      .eq('status', 'saved')
    : { data: [], error: null }

  if (waiverError) return NextResponse.json({ error: waiverError.message }, { status: 500 })
  const waivedInvoiceIds = new Set((waiverRows || []).map((row: any) => String(row.invoice_id)))
  const summary = {
    checked: openInvoices.length,
    textSent: 0,
    emailSent: 0,
    lateFeesApplied: 0,
    skipped: 0,
    failed: 0,
    results: [] as any[],
  }

  for (const invoice of openInvoices) {
    const daysUntilDue = daysUntilDate(String(invoice.due_date), today)
    const heldCredit = availableCreditByCamper.get(String(invoice.camper_id || '')) || 0
    if (daysUntilDue > 0 && heldCredit > 0) {
      summary.skipped += 1
      summary.results.push({
        invoiceId: invoice.id,
        dueDate: invoice.due_date,
        kind: 'credit_held_until_due',
        availableCredit: heldCredit,
        reason: 'Account credit is reserved until the invoice due date. Any uncovered remainder will be sent then.',
      })
      continue
    }
    const daysPastDue = Math.max(0, -daysUntilDue)
    const lateFeeWaived = waivedInvoiceIds.has(String(invoice.id))
    let lateFeeWarningCompletedBeforeToday = Number(invoice.late_fee || 0) > 0

    if (!lateFeeWaived && daysPastDue >= LATE_FEE_WARNING_DAY && Number(invoice.late_fee || 0) <= 0) {
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
      !lateFeeWaived &&
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
          .in('status', ['open', 'sent', 'overdue'])
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

  return NextResponse.json({ success: true, today, creditSummary, ...summary })
}

export const GET = withCronFailureAlert('invoice-text-reminders', runCron)
