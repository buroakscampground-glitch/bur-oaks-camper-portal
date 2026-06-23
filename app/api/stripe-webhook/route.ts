import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { sendPaymentReceivedAlert } from '../../../lib/payment-alerts'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const stripeKey = process.env.STRIPE_SECRET_KEY
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

  if (!stripeKey || !webhookSecret || !serviceRoleKey || !supabaseUrl) {
    return NextResponse.json({ error: 'Missing server configuration' }, { status: 500 })
  }

  const signature = request.headers.get('stripe-signature')

  if (!signature) {
    return NextResponse.json({ error: 'Missing Stripe signature' }, { status: 400 })
  }

  const stripe = new Stripe(stripeKey)
  const payload = await request.text()
  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(payload, signature, webhookSecret)
  } catch {
    return NextResponse.json({ error: 'Invalid Stripe signature' }, { status: 400 })
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)
  const { error: ledgerError } = await supabaseAdmin
    .from('stripe_webhook_events')
    .insert({ event_id: event.id, event_type: event.type })

  if (ledgerError?.code === '23505') {
    return NextResponse.json({ received: true, duplicate: true })
  }

  const ledgerMissing = ledgerError?.code === '42P01' || ledgerError?.code === 'PGRST205'

  if (ledgerError && !ledgerMissing) {
    console.error('Unable to record Stripe webhook event:', ledgerError)
    return NextResponse.json({ error: 'Webhook processing unavailable' }, { status: 500 })
  }

  // During migration rollout, continue only when the ledger table is not present yet.
  const ledgerActive = !ledgerError

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session

      if (
        session.mode === 'setup' &&
        session.metadata?.purpose === 'autopay_enrollment' &&
        typeof session.customer === 'string' &&
        typeof session.setup_intent === 'string'
      ) {
        const setupIntent = await stripe.setupIntents.retrieve(session.setup_intent)
        const paymentMethod = setupIntent.payment_method

        if (setupIntent.status === 'succeeded' && typeof paymentMethod === 'string') {
          const customer = await stripe.customers.retrieve(session.customer)

          if (!customer.deleted) {
            await stripe.customers.update(session.customer, {
              invoice_settings: { default_payment_method: paymentMethod },
              metadata: {
                ...customer.metadata,
                autopay_enabled: 'true',
                autopay_preference: session.metadata.autopay_preference || 'both',
              },
            })
          }
        }
      }

      if (session.mode === 'payment' && session.payment_status === 'paid') {
        let invoiceIds: string[] = []

        try {
          const parsed = JSON.parse(session.metadata?.invoice_ids || '[]')
          invoiceIds = Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : []
        } catch {
          invoiceIds = []
        }

        if (invoiceIds.length > 0) {
          const { data: invoices, error: invoiceError } = await supabaseAdmin
            .from('invoices')
            .select('*')
            .in('id', invoiceIds)

          if (invoiceError || !invoices || invoices.length !== invoiceIds.length) {
            throw new Error('Unable to verify paid invoices.')
          }

          const expectedAmount = invoices.reduce(
            (sum, invoice) => sum + Math.round(Number(invoice.total_due || 0) * 100),
            0
          )
          const camperIds = new Set(invoices.map((invoice) => String(invoice.camper_id)))

          if (
            expectedAmount !== session.amount_total ||
            camperIds.size !== 1 ||
            (session.metadata?.camper_id && !camperIds.has(session.metadata.camper_id))
          ) {
            throw new Error('Stripe payment verification failed.')
          }

          const { error: updateError } = await supabaseAdmin
            .from('invoices')
            .update({ status: 'paid' })
            .in('id', invoiceIds)

          if (updateError) throw updateError

          const camperId = invoices[0]?.camper_id
          const amountPaid = invoices.reduce((sum, invoice) => sum + Number(invoice.total_due || 0), 0)

          await sendPaymentReceivedAlert({
            admin: supabaseAdmin,
            invoiceIds,
            camperId,
            amountPaid,
            paymentType: 'Online payment',
            origin: request.headers.get('origin'),
          })
        }
      }
    }

    if (event.type === 'payment_intent.succeeded') {
      const intent = event.data.object as Stripe.PaymentIntent
      const invoiceId = intent.metadata.invoice_id

      if (intent.metadata.purpose === 'autopay_invoice' && invoiceId) {
        const { data: invoice, error: invoiceLookupError } = await supabaseAdmin
          .from('invoices')
          .select('*')
          .eq('id', invoiceId)
          .single()

        if (invoiceLookupError) throw invoiceLookupError

        if (invoice.status === 'paid') {
          return NextResponse.json({ received: true, alreadyPaid: true })
        }

        const { error } = await supabaseAdmin
          .from('invoices')
          .update({ status: 'paid' })
          .eq('id', invoiceId)

        if (error) throw error

        const amountPaid = Number(invoice?.total_due || 0)

        await sendPaymentReceivedAlert({
          admin: supabaseAdmin,
          invoiceIds: [String(invoiceId)],
          camperId: invoice?.camper_id,
          amountPaid,
          paymentType: 'AutoPay',
          origin: request.headers.get('origin'),
        })
      }
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Stripe webhook processing failed:', error)

    if (ledgerActive) {
      await supabaseAdmin
        .from('stripe_webhook_events')
        .delete()
        .eq('event_id', event.id)
    }

    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}
