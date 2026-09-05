import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ONE_TIME_KEY = 'a11209f135774a11b53171073119f198'
const INVOICE_ID = 'bcd7ed01-e02e-4792-8f3b-9850dacc752e'

function authorized(request: Request) {
  return request.headers.get('x-one-time-key') === ONE_TIME_KEY
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: 'Not found.' }, { status: 404 })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  const stripeKey = process.env.STRIPE_SECRET_KEY
  if (!url || !key || !stripeKey) {
    return NextResponse.json({ error: 'Production payment services are not configured.' }, { status: 500 })
  }

  try {
    const admin = createClient(url, key)
    const stripe = new Stripe(stripeKey)
    const { data: invoice, error } = await admin
      .from('invoices')
      .select('id,camper_id,invoice_number,invoice_type,total_due,due_date,status,payment_method,payment_reference,paid_at,created_at')
      .eq('id', INVOICE_ID)
      .single()
    if (error) throw error

    const reference = String(invoice.payment_reference || '')
    if (!reference.startsWith('pi_')) return NextResponse.json({ invoice, stripe: null })

    const intent = await stripe.paymentIntents.retrieve(reference, { expand: ['latest_charge'] })
    const charge = typeof intent.latest_charge === 'string' ? null : intent.latest_charge
    const events = await stripe.events.list({ limit: 100, types: [
      'payment_intent.processing',
      'payment_intent.succeeded',
      'payment_intent.payment_failed',
      'payment_intent.canceled',
      'charge.pending',
      'charge.succeeded',
      'charge.failed',
    ] })
    const matchingEvents = events.data
      .filter((event) => {
        const object = event.data.object as { id?: string; payment_intent?: string | Stripe.PaymentIntent | null }
        const paymentIntentId = typeof object.payment_intent === 'string' ? object.payment_intent : object.payment_intent?.id
        return object.id === reference || paymentIntentId === reference
      })
      .map((event) => ({ id: event.id, type: event.type, created: event.created }))

    return NextResponse.json({
      invoice,
      stripe: {
        id: intent.id,
        status: intent.status,
        amount: intent.amount,
        amountReceived: intent.amount_received,
        created: intent.created,
        canceledAt: intent.canceled_at,
        paymentMethodTypes: intent.payment_method_types,
        lastPaymentError: intent.last_payment_error ? {
          code: intent.last_payment_error.code,
          message: intent.last_payment_error.message,
          type: intent.last_payment_error.type,
        } : null,
        charge: charge ? {
          id: charge.id,
          status: charge.status,
          paid: charge.paid,
          captured: charge.captured,
          failureCode: charge.failure_code,
          failureMessage: charge.failure_message,
          created: charge.created,
        } : null,
        events: matchingEvents,
      },
    })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Unable to audit Karen Smith payment.' }, { status: 500 })
  }
}
