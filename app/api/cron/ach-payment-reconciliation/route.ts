import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getSiteUrl } from '../../../../lib/site-url'
import { ensureStripePaymentWebhook, reconcileProcessingAchPayments } from '../../../../lib/stripe-ach-reconciliation'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Cron is not authorized.' }, { status: 401 })
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!stripeKey || !serviceRoleKey || !supabaseUrl) {
    return NextResponse.json({ error: 'Payment reconciliation is not configured.' }, { status: 500 })
  }

  try {
    const stripe = new Stripe(stripeKey)
    const admin = createClient(supabaseUrl, serviceRoleKey)
    const origin = getSiteUrl()
    const [webhookResult, reconciliationResult] = await Promise.allSettled([
      ensureStripePaymentWebhook(stripe, origin),
      reconcileProcessingAchPayments({ stripe, admin, origin }),
    ])
    if (reconciliationResult.status === 'rejected') throw reconciliationResult.reason
    const webhook = webhookResult.status === 'fulfilled'
      ? webhookResult.value
      : { status: 'check-failed', error: webhookResult.reason?.message || 'Unable to update Stripe webhook events.' }
    const reconciliation = reconciliationResult.value
    return NextResponse.json({ success: true, webhook, reconciliation })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Unable to reconcile bank payments.' }, { status: 500 })
  }
}
