import Stripe from 'stripe'
import { loadStripePayoutDetail } from './stripe-payout-reconciliation.ts'
import { printStripePayoutReport } from './stripe-payout-report.ts'

function reportDate(detail: { arrivalDate: string }) {
  return detail.arrivalDate.slice(0, 10)
}

export async function reconcileAndPrintStripePayout(stripe: Stripe, admin: any, payoutId: string, force = false) {
  const detail = await loadStripePayoutDetail(stripe, admin, payoutId)
  const key = `stripe-payout-${payoutId}`
  const date = reportDate(detail)
  let reservation: any = null
  let { data, error } = await admin.from('scheduled_reports').insert({ report_key: key, report_date: date, status: 'running' }).select('id,status').single()
  reservation = data

  if (error?.code === '23505') {
    const existing = await admin.from('scheduled_reports').select('id,status').eq('report_key', key).eq('report_date', date).maybeSingle()
    if (existing.data?.status === 'sent' && !force) return { detail, skipped: true, reason: 'This Stripe deposit already printed.' }
    reservation = existing.data
    error = existing.error
    if (reservation?.id) {
      await admin.from('scheduled_reports').update({ status: 'running', error_message: null, started_at: new Date().toISOString(), completed_at: null, updated_at: new Date().toISOString() }).eq('id', reservation.id)
    }
  }
  if (error || !reservation) throw new Error(error?.message || 'Unable to reserve the Stripe deposit report.')

  try {
    const result = await printStripePayoutReport(detail)
    const status = result.sent ? 'sent' : 'failed'
    await admin.from('scheduled_reports').update({
      status,
      item_count: detail.rows.length,
      office_email_status: 'skipped',
      printer_email_status: result.sent ? 'sent' : 'failed',
      error_message: result.error || null,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', reservation.id)
    if (!result.sent) throw new Error(result.error || 'The Stripe deposit report did not reach every printer.')
    return { detail, skipped: false, printers: result.printers }
  } catch (error: any) {
    await admin.from('scheduled_reports').update({ status: 'failed', error_message: String(error?.message || error).slice(0, 2000), completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', reservation.id)
    throw error
  }
}
