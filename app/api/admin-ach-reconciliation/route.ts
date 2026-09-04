import Stripe from 'stripe'
import { NextResponse } from 'next/server'
import { getAuthenticatedContext } from '../../../lib/server-auth'
import { getSiteUrl } from '../../../lib/site-url'
import { ensureStripePaymentWebhook, reconcileProcessingAchPayments } from '../../../lib/stripe-ach-reconciliation'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: Request) {
  const context = await getAuthenticatedContext(request)
  if (!context || context.camper.role?.toLowerCase() !== 'admin') {
    return NextResponse.json({ error: 'Only an administrator can reconcile bank payments.' }, { status: 403 })
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY
  if (!stripeKey) return NextResponse.json({ error: 'Stripe is not configured.' }, { status: 500 })

  try {
    const stripe = new Stripe(stripeKey)
    const origin = getSiteUrl()
    const [webhookResult, reconciliationResult] = await Promise.allSettled([
      ensureStripePaymentWebhook(stripe, origin),
      reconcileProcessingAchPayments({ stripe, admin: context.admin, origin }),
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
