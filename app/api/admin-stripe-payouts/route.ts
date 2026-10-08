import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getAuthenticatedContext } from '../../../lib/server-auth'
import { loadStripePayoutDetail } from '../../../lib/stripe-payout-reconciliation'
import { reconcileAndPrintStripePayout } from '../../../lib/stripe-payout-printing'
import { reportOperationalFailure, supportReferenceMessage } from '../../../lib/operational-errors'

export const runtime = 'nodejs'
export const maxDuration = 60

type PrintRecord = {
  report_key?: string | null
  status?: string | null
  completed_at?: string | null
  error_message?: string | null
}

async function adminContext(request: Request) {
  const context = await getAuthenticatedContext(request)
  if (!context || String(context.camper.role || '').toLowerCase() !== 'admin') return null
  return context
}

function stripeClient() {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error('Stripe is not configured.')
  return new Stripe(process.env.STRIPE_SECRET_KEY)
}

export async function GET(request: Request) {
  const context = await adminContext(request)
  if (!context) return NextResponse.json({ error: 'Admin access is required.' }, { status: 401 })
  try {
    const stripe = stripeClient()
    const url = new URL(request.url)
    const payoutId = url.searchParams.get('id')
    if (payoutId) {
      const detail = await loadStripePayoutDetail(stripe, context.admin, payoutId)
      const { data: printRecord } = await context.admin.from('scheduled_reports').select('status,completed_at,error_message').eq('report_key', `stripe-payout-${payoutId}`).order('report_date', { ascending: false }).limit(1).maybeSingle()
      return NextResponse.json({ detail, printRecord }, { headers: { 'Cache-Control': 'no-store' } })
    }

    const [payoutPage, balance, balanceSettings] = await Promise.all([
      stripe.payouts.list({ limit: 50 }),
      stripe.balance.retrieve(),
      stripe.balanceSettings.retrieve(),
    ])
    const payouts = payoutPage.data.slice(0, 30)
    const payoutIds = payouts.map((payout) => `stripe-payout-${payout.id}`)
    const { data: records } = payoutIds.length
      ? await context.admin.from('scheduled_reports').select('report_key,status,completed_at,error_message').in('report_key', payoutIds)
      : { data: [] }
    const recordMap = new Map((records || []).map((record) => [record.report_key, record as PrintRecord]))
    const usdAvailable = balance.available.find((item) => item.currency === 'usd')?.amount || 0
    const usdPending = balance.pending.find((item) => item.currency === 'usd')?.amount || 0
    const payoutSettings = balanceSettings.payments.payouts
    return NextResponse.json({
      health: {
        payoutsEnabled: payoutSettings?.status === 'enabled',
        schedule: payoutSettings?.schedule?.interval || 'unknown',
        automaticPayouts: ['daily', 'weekly', 'monthly'].includes(payoutSettings?.schedule?.interval || ''),
        settlementDelayDays: balanceSettings.payments.settlement_timing.delay_days,
        availableCents: usdAvailable,
        pendingCents: usdPending,
        failedPayouts: payouts.filter((payout) => payout.status === 'failed').length,
        activePayouts: payouts.filter((payout) => payout.status === 'pending' || payout.status === 'in_transit').length,
      },
      payouts: payouts.map((payout) => ({
        id: payout.id,
        amountCents: payout.amount,
        currency: payout.currency,
        status: payout.status,
        created: new Date(payout.created * 1000).toISOString(),
        arrivalDate: new Date(payout.arrival_date * 1000).toISOString(),
        method: payout.method,
        automatic: payout.automatic,
        printRecord: recordMap.get(`stripe-payout-${payout.id}`) || null,
      })),
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error: unknown) {
    const requestId = reportOperationalFailure(request, { operation: 'stripe-payouts-load', actorRole: 'admin' }, error)
    return NextResponse.json({
      error: supportReferenceMessage('Stripe deposits are temporarily unavailable. Please try again.', requestId),
      requestId,
    }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const context = await adminContext(request)
  if (!context) return NextResponse.json({ error: 'Admin access is required.' }, { status: 401 })
  let action = ''
  let payoutId = ''
  try {
    const body = await request.json()
    payoutId = String(body.payoutId || '')
    action = String(body.action || '')
    if (!/^po_[A-Za-z0-9]+$/.test(payoutId)) return NextResponse.json({ error: 'Choose a valid Stripe deposit.' }, { status: 400 })
    const stripe = stripeClient()
    if (action === 'print') {
      const result = await reconcileAndPrintStripePayout(stripe, context.admin, payoutId, true)
      return NextResponse.json({ success: true, ...result })
    }
    const detail = await loadStripePayoutDetail(stripe, context.admin, payoutId)
    return NextResponse.json({ success: true, detail })
  } catch (error: unknown) {
    const requestId = reportOperationalFailure(request, {
      operation: action === 'print' ? 'stripe-payout-print' : 'stripe-payout-reconcile',
      actorRole: 'admin',
      identifiers: { payoutId },
    }, error)
    const message = action === 'print'
      ? 'The print result could not be confirmed. Check the Epson printer before retrying.'
      : 'This Stripe deposit could not be reconciled. Please try again.'
    return NextResponse.json({ error: supportReferenceMessage(message, requestId), requestId }, { status: 500 })
  }
}
