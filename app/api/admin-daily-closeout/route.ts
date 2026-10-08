import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getAuthenticatedContext } from '../../../lib/server-auth'
import {
  centralDateKey,
  centralDayRange,
  closeoutDateKeys,
  summarizeCloseoutHistory,
  summarizeDailyCloseout,
  type CloseoutCredit,
  type CloseoutCreditApplication,
  type CloseoutInvoice,
  type CloseoutPayout,
  type ManualAllocationRecord,
  type ManualPaymentRecord,
} from '../../../lib/daily-closeout'
import { loadMoneyExceptionQueue } from '../../../lib/money-exceptions-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function dateKey(value: string | null) {
  if (!value) return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date())
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const parsed = new Date(`${value}T12:00:00Z`)
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value ? null : value
}

export async function GET(request: Request) {
  const context = await getAuthenticatedContext(request)
  if (!context || String(context.camper.role || '').toLowerCase() !== 'admin') {
    return NextResponse.json({ error: 'Admin access is required.' }, { status: 401 })
  }

  try {
    const date = dateKey(new URL(request.url).searchParams.get('date'))
    if (!date) return NextResponse.json({ error: 'Choose a valid campground date.' }, { status: 400 })
    const dates = closeoutDateKeys(date, 7)
    const { start } = centralDayRange(dates[0])
    const { end } = centralDayRange(date)
    const [invoiceResult, manualResult, extraCreditResult, creditApplicationResult] = await Promise.all([
      context.admin.from('invoices')
        .select('id,invoice_number,invoice_type,total_due,subtotal,late_fee,status,payment_method,paid_at,camper_id,campers(first_name,last_name,lot_number)')
        .eq('status', 'paid').gte('paid_at', start).lt('paid_at', end).order('paid_at', { ascending: true }),
      context.admin.from('manual_payments')
        .select('id,camper_id,amount,payment_method,received_on,created_at,credit_id,result,campers(first_name,last_name,lot_number)')
        .gte('received_on', dates[0]).lte('received_on', date).order('created_at', { ascending: true }),
      context.admin.from('account_credits')
        .select('id,camper_id,original_amount,remaining_amount,applies_to,created_at,campers(first_name,last_name,lot_number)')
        .like('source_reference', 'stripe-extra:%').gte('created_at', start).lt('created_at', end).order('created_at', { ascending: true }),
      context.admin.from('account_credit_applications')
        .select('id,credit_id,amount_applied,applied_at,invoice_id,invoices(invoice_number,invoice_type),campers(first_name,last_name,lot_number)')
        .gte('applied_at', start).lt('applied_at', end).order('applied_at', { ascending: true }),
    ])
    for (const result of [invoiceResult, manualResult, extraCreditResult, creditApplicationResult]) {
      if (result.error) throw result.error
    }

    const invoices = (invoiceResult.data || []) as CloseoutInvoice[]
    const manualPayments = (manualResult.data || []) as ManualPaymentRecord[]
    const onlineExtraCredits = (extraCreditResult.data || []) as CloseoutCredit[]
    const creditApplications = (creditApplicationResult.data || []) as CloseoutCreditApplication[]
    const paymentIds = manualPayments.map((payment) => payment.id)
    const allocationResult = paymentIds.length
      ? await context.admin.from('manual_payment_allocations')
          .select('payment_id,invoice_id,amount_applied,invoices(invoice_number,invoice_type)')
          .in('payment_id', paymentIds)
      : { data: [], error: null }
    if (allocationResult.error) throw allocationResult.error
    const manualAllocations = (allocationResult.data || []) as ManualAllocationRecord[]

    if (!process.env.STRIPE_SECRET_KEY) throw new Error('Stripe is not configured for the closeout check.')
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
    const payoutPage = await stripe.payouts.list({ limit: 100 })
    const oldestArrival = payoutPage.data.length
      ? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date(payoutPage.data[payoutPage.data.length - 1].arrival_date * 1000))
      : null
    if (payoutPage.has_more && oldestArrival && dates[0] <= oldestArrival) {
      throw new Error('That date is older than the safely loaded Stripe deposit history. Open Stripe Deposits for the exact older reconciliation.')
    }
    const payouts: CloseoutPayout[] = payoutPage.data
      .filter((payout) => {
        const arrival = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date(payout.arrival_date * 1000))
        return arrival >= dates[0] && arrival <= date
      })
      .map((payout) => ({
        id: payout.id,
        amount: payout.amount,
        status: payout.status,
        arrivalDate: new Date(payout.arrival_date * 1000).toISOString(),
        automatic: payout.automatic,
      }))

    const exceptions = await loadMoneyExceptionQueue({ admin: context.admin, stripe, payouts: payoutPage.data })
    const paymentDate = new Map(manualPayments.map((payment) => [payment.id, payment.received_on || centralDateKey(payment.created_at)]))
    const selected = {
      invoices: invoices.filter((row) => centralDateKey(row.paid_at) === date),
      manualPayments: manualPayments.filter((row) => (row.received_on || centralDateKey(row.created_at)) === date),
      manualAllocations: manualAllocations.filter((row) => paymentDate.get(String(row.payment_id || '')) === date),
      onlineExtraCredits: onlineExtraCredits.filter((row) => centralDateKey(row.created_at) === date),
      creditApplications: creditApplications.filter((row) => centralDateKey(row.applied_at) === date),
      payouts: payouts.filter((row) => centralDateKey(row.arrivalDate) === date),
    }

    const closeout = summarizeDailyCloseout({
      ...selected,
      exceptionCount: exceptions.length,
    })
    const history = summarizeCloseoutHistory({ dates, invoices, manualPayments, manualAllocations, onlineExtraCredits, creditApplications, payouts })
    return NextResponse.json({
      date,
      generatedAt: new Date().toISOString(),
      history,
      moneyExceptions: exceptions.slice(0, 5),
      ...closeout,
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to build the daily money closeout.' }, { status: 500 })
  }
}
