import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type Stripe from 'stripe'
import { buildMoneyExceptionQueue, type ProcessorPayout } from './money-exceptions'

function paymentIntentId(value: string | Stripe.PaymentIntent | null) {
  return typeof value === 'string' ? value : value?.id || null
}

export async function loadMoneyExceptionQueue({
  admin,
  stripe,
  payouts,
}: {
  admin: SupabaseClient
  stripe: Stripe
  payouts?: ProcessorPayout[]
}) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date())
  const recent = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const [alertResult, lateAchResult, unmatchedResult, payoutPage, disputePage, refundPage] = await Promise.all([
    admin.from('admin_notifications')
      .select('id,title,message,lot_number,source_table,source_id,created_at')
      .eq('type', 'payment_problem').is('read_at', null).order('created_at', { ascending: false }).limit(100),
    admin.from('invoices')
      .select('id,invoice_number,total_due,subtotal,status,payment_reference,ach_expected_date,campers(lot_number)')
      .eq('status', 'processing').lt('ach_expected_date', today).order('ach_expected_date', { ascending: true }).limit(100),
    admin.from('invoices')
      .select('id,invoice_number,total_due,subtotal,status,payment_method,payment_reference,paid_at,campers(lot_number)')
      .eq('status', 'paid').is('payment_method', null).is('payment_reference', null).gte('paid_at', recent).order('paid_at', { ascending: false }).limit(100),
    payouts ? Promise.resolve({ data: payouts }) : stripe.payouts.list({ limit: 50 }),
    stripe.disputes.list({ limit: 50, expand: ['data.charge'] }),
    stripe.refunds.list({ limit: 50 }),
  ])
  if (alertResult.error) throw alertResult.error
  if (lateAchResult.error) throw lateAchResult.error
  if (unmatchedResult.error) throw unmatchedResult.error

  const disputes = disputePage.data
    .filter((dispute) => !['won', 'lost'].includes(String(dispute.status)))
    .map((dispute) => ({
      id: dispute.id,
      amount: dispute.amount,
      status: dispute.status,
      created: dispute.created,
      paymentIntent: typeof dispute.charge === 'object' && dispute.charge ? paymentIntentId(dispute.charge.payment_intent) : null,
    }))
  const refunds = refundPage.data.map((refund) => ({
    id: refund.id,
    amount: refund.amount,
    status: refund.status,
    created: refund.created,
    paymentIntent: paymentIntentId(refund.payment_intent),
  }))
  const references = Array.from(new Set(
    [...disputes, ...refunds]
      .map((row) => row.paymentIntent)
      .filter((reference): reference is string => Boolean(reference))
  ))
  const invoiceResult = references.length
    ? await admin.from('invoices')
        .select('id,invoice_number,payment_reference,campers(lot_number)').in('payment_reference', references)
    : { data: [], error: null }
  if (invoiceResult.error) throw invoiceResult.error

  return buildMoneyExceptionQueue({
    alerts: alertResult.data || [],
    lateAchInvoices: lateAchResult.data || [],
    unmatchedInvoices: unmatchedResult.data || [],
    payouts: payoutPage.data,
    disputes,
    refunds,
    referencedInvoices: invoiceResult.data || [],
  })
}
