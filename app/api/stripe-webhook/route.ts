import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: '2026-05-27.dahlia',
})

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
const supabaseUrl = process.env.SUPABASE_URL || 'https://mzywctpxnpejglnspyqi.supabase.co'
const supabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRole || '')

export async function POST(request: Request) {
  if (!webhookSecret) {
    return NextResponse.json(
      { error: 'Stripe webhook secret is not configured.' },
      { status: 500 }
    )
  }

  if (!supabaseServiceRole) {
    return NextResponse.json(
      { error: 'Supabase service role key is not configured.' },
      { status: 500 }
    )
  }

  const payload = await request.text()
  const signature = request.headers.get('stripe-signature')

  if (!signature) {
    return NextResponse.json(
      { error: 'Missing Stripe signature header.' },
      { status: 400 }
    )
  }

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(payload, signature, webhookSecret)
  } catch (error: any) {
    console.error('Stripe webhook verification failed:', error.message)
    return NextResponse.json(
      { error: `Webhook verification failed: ${error.message}` },
      { status: 400 }
    )
  }

  console.log('Received Stripe webhook event:', event.type)

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    const metadata = session.metadata || {}
    const invoiceIds = metadata.invoice_ids
      ? JSON.parse(metadata.invoice_ids as string)
      : []

    console.log('checkout.session.completed invoice IDs:', invoiceIds)

    if (Array.isArray(invoiceIds) && invoiceIds.length > 0) {
      const { error } = await supabaseAdmin
        .from('invoices')
        .update({ status: 'paid' })
        .in('id', invoiceIds)

      if (error) {
        return NextResponse.json(
          { error: `Failed to update invoices: ${error.message}` },
          { status: 500 }
        )
      }
    }
  }

  return NextResponse.json({ received: true })
}
