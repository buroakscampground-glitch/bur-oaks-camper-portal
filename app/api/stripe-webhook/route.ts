import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

export async function GET() {
  return NextResponse.json({
    success: true,
    message: 'Webhook route is working',
  })
}

export async function POST(request: Request) {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  const supabaseServiceRole =
    process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    'https://mzywctpxnpejglnspyqi.supabase.co'

  console.log(
    'WEBHOOK SECRET EXISTS:',
    !!webhookSecret
  )

  console.log(
    'SUPABASE KEY EXISTS:',
    !!supabaseServiceRole
  )

  if (!stripeSecretKey || !webhookSecret) {
    return NextResponse.json(
      { error: 'Missing Stripe configuration' },
      { status: 500 }
    )
  }

  if (!supabaseServiceRole) {
    return NextResponse.json(
      { error: 'Missing SUPABASE_SERVICE_ROLE_KEY' },
      { status: 500 }
    )
  }

  const supabaseAdmin = createClient(
    supabaseUrl,
    supabaseServiceRole
  )

  const payload = await request.text()
  const signature = request.headers.get('stripe-signature')

  if (!signature) {
    return NextResponse.json(
      { error: 'Missing Stripe signature' },
      { status: 400 }
    )
  }

  let event: Stripe.Event
  const stripe = new Stripe(stripeSecretKey)

  try {
    event = stripe.webhooks.constructEvent(
      payload,
      signature,
      webhookSecret
    )
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 400 }
    )
  }

  if (event.type === 'checkout.session.completed') {
    const session =
      event.data.object as Stripe.Checkout.Session

    if (
      session.mode === 'setup' &&
      session.metadata?.purpose === 'autopay_enrollment' &&
      typeof session.customer === 'string' &&
      typeof session.setup_intent === 'string'
    ) {
      const setupIntent = await stripe.setupIntents.retrieve(
        session.setup_intent
      )
      const paymentMethod = setupIntent.payment_method

      if (typeof paymentMethod === 'string') {
        const customer = await stripe.customers.retrieve(session.customer)

        if (!customer.deleted) {
          await stripe.customers.update(session.customer, {
            invoice_settings: {
              default_payment_method: paymentMethod,
            },
            metadata: {
              ...customer.metadata,
              autopay_enabled: 'true',
              autopay_preference:
                session.metadata.autopay_preference || 'both',
            },
          })
        }
      }

      return NextResponse.json({ received: true })
    }

    let invoiceIds: string[] = []

    try {
      invoiceIds = JSON.parse(session.metadata?.invoice_ids || '[]')
    } catch {
      invoiceIds = []
    }

    console.log('Invoice IDs:', invoiceIds)

    if (
      Array.isArray(invoiceIds) &&
      invoiceIds.length > 0
    ) {
      const { error } = await supabaseAdmin
        .from('invoices')
        .update({ status: 'paid' })
        .in('id', invoiceIds)

      if (error) {
        console.error(
          'SUPABASE UPDATE ERROR:',
          error
        )

        return NextResponse.json(
          { error: error.message },
          { status: 500 }
        )
      }
    }
  }

  if (event.type === 'payment_intent.succeeded') {
    const intent = event.data.object as Stripe.PaymentIntent
    const invoiceId = intent.metadata.invoice_id

    if (intent.metadata.purpose === 'autopay_invoice' && invoiceId) {
      await supabaseAdmin
        .from('invoices')
        .update({ status: 'paid' })
        .eq('id', invoiceId)
    }
  }

  return NextResponse.json({
    received: true,
  })
}
