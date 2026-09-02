import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getAuthenticatedContext } from '../../../lib/server-auth'
import { loadStripePayoutDetail } from '../../../lib/stripe-payout-reconciliation'
import { reconcileAndPrintStripePayout } from '../../../lib/stripe-payout-printing'

export const runtime = 'nodejs'
export const maxDuration = 60

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

    const payoutPage = await stripe.payouts.list({ limit: 50 })
    const payouts = payoutPage.data.filter((payout) => payout.automatic).slice(0, 30)
    const payoutIds = payouts.map((payout) => `stripe-payout-${payout.id}`)
    const { data: records } = payoutIds.length
      ? await context.admin.from('scheduled_reports').select('report_key,status,completed_at,error_message').in('report_key', payoutIds)
      : { data: [] }
    const recordMap = new Map((records || []).map((record: any) => [record.report_key, record]))
    return NextResponse.json({
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
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Unable to load Stripe deposits.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const context = await adminContext(request)
  if (!context) return NextResponse.json({ error: 'Admin access is required.' }, { status: 401 })
  try {
    const body = await request.json()
    const payoutId = String(body.payoutId || '')
    if (!/^po_[A-Za-z0-9]+$/.test(payoutId)) return NextResponse.json({ error: 'Choose a valid Stripe deposit.' }, { status: 400 })
    const stripe = stripeClient()
    if (body.action === 'print') {
      const result = await reconcileAndPrintStripePayout(stripe, context.admin, payoutId, true)
      return NextResponse.json({ success: true, ...result })
    }
    const detail = await loadStripePayoutDetail(stripe, context.admin, payoutId)
    return NextResponse.json({ success: true, detail })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Unable to reconcile this Stripe deposit.' }, { status: 500 })
  }
}
