import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { loadStripePayoutDetail } from '../../../../lib/stripe-payout-reconciliation'
import { reconcileAndPrintStripePayout } from '../../../../lib/stripe-payout-printing'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Prevent the first release from unexpectedly printing years of old deposits.
const AUTOMATIC_PRINT_START = Math.floor(Date.parse('2026-09-01T00:00:00-05:00') / 1000)

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: 'Cron is not authorized.' }, { status: 401 })
  const key = process.env.STRIPE_SECRET_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!key || !serviceRoleKey || !supabaseUrl) return NextResponse.json({ error: 'Stripe or Supabase is not configured.' }, { status: 500 })

  const stripe = new Stripe(key)
  const admin = createClient(supabaseUrl, serviceRoleKey)
  const payouts = await stripe.payouts.list({ limit: 25, status: 'paid' })
  const candidates = payouts.data.filter((payout) => payout.automatic && payout.created >= AUTOMATIC_PRINT_START)
  const results: any[] = []

  for (const payout of candidates) {
    try {
      const detail = await loadStripePayoutDetail(stripe, admin, payout.id)
      if (!detail.rows.length || detail.summary.differenceCents !== 0) {
        results.push({ id: payout.id, amount: payout.amount, status: 'waiting', transactionCount: detail.rows.length, difference: detail.summary.differenceCents })
        continue
      }
      const result = await reconcileAndPrintStripePayout(stripe, admin, payout.id)
      results.push({ id: payout.id, amount: payout.amount, status: result.skipped ? 'already-printed' : 'printed' })
    } catch (error: any) {
      results.push({ id: payout.id, amount: payout.amount, status: 'failed', error: String(error?.message || error).slice(0, 500) })
    }
  }

  const failed = results.filter((result) => result.status === 'failed')
  return NextResponse.json({ success: failed.length === 0, checked: candidates.length, results }, { status: failed.length ? 502 : 200 })
}
