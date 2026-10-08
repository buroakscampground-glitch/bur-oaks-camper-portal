import Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'
import { loadStripePayoutDetail } from './stripe-payout-reconciliation.ts'
import { printStripePayoutReport } from './stripe-payout-report.ts'

type ScheduledReportReservation = {
  id: string
  status?: string | null
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error || 'Unknown printing error')
}

export function payoutPrintReservationDecision(status: unknown, force: boolean) {
  if (force) return { action: 'print' as const }
  const normalized = String(status || '').toLowerCase()
  if (normalized === 'sent') {
    return { action: 'skip' as const, reason: 'This Stripe deposit already printed.' }
  }
  if (normalized === 'running') {
    return { action: 'skip' as const, reason: 'This Stripe deposit already has a print attempt in progress or awaiting verification. Check the Epson printer before reprinting.' }
  }
  return { action: 'skip' as const, reason: 'A previous Stripe deposit print attempt needs review. Check the Epson printer, then use the manual reprint action if needed.' }
}

function reportDate(detail: { arrivalDate: string }) {
  return detail.arrivalDate.slice(0, 10)
}

export async function reconcileAndPrintStripePayout(stripe: Stripe, admin: SupabaseClient, payoutId: string, force = false) {
  const detail = await loadStripePayoutDetail(stripe, admin, payoutId)
  const key = `stripe-payout-${payoutId}`
  const date = reportDate(detail)
  let reservation: ScheduledReportReservation | null = null
  let { data, error } = await admin.from('scheduled_reports').insert({ report_key: key, report_date: date, status: 'running' }).select('id,status').single()
  reservation = data as ScheduledReportReservation | null

  if (error?.code === '23505') {
    const existing = await admin.from('scheduled_reports').select('id,status').eq('report_key', key).eq('report_date', date).maybeSingle()
    if (existing.error || !existing.data) throw existing.error || new Error('The Stripe deposit print reservation could not be verified.')
    reservation = existing.data as ScheduledReportReservation
    error = existing.error
    const decision = payoutPrintReservationDecision(reservation.status, force)
    if (decision.action === 'skip') return { detail, skipped: true, reason: decision.reason }
    if (reservation.id) {
      const reset = await admin.from('scheduled_reports').update({ status: 'running', error_message: null, started_at: new Date().toISOString(), completed_at: null, updated_at: new Date().toISOString() }).eq('id', reservation.id)
      if (reset.error) throw reset.error
    }
  }
  if (error || !reservation) throw error || new Error('Unable to reserve the Stripe deposit report.')

  try {
    const result = await printStripePayoutReport(detail)
    const status = result.sent ? 'sent' : 'failed'
    const recorded = await admin.from('scheduled_reports').update({
      status,
      item_count: detail.rows.length,
      office_email_status: 'skipped',
      printer_email_status: result.sent ? 'sent' : 'failed',
      error_message: result.error || null,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', reservation.id)
    if (recorded.error) throw recorded.error
    if (!result.sent) throw new Error(result.error || 'The Stripe deposit report did not reach every printer.')
    return { detail, skipped: false, printers: result.printers }
  } catch (error: unknown) {
    const failed = await admin.from('scheduled_reports').update({ status: 'failed', error_message: errorMessage(error).slice(0, 2000), completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', reservation.id)
    if (failed.error) console.error('Stripe payout print failure could not be recorded:', failed.error)
    throw error
  }
}
