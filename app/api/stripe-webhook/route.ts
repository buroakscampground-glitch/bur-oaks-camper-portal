import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { sendPaymentReceivedAlert } from '../../../lib/payment-alerts'
import { createAdminNotification } from '../../../lib/admin-notifications'
import { getSiteUrl } from '../../../lib/site-url'

export const runtime = 'nodejs'

function checkoutInvoiceIds(session: Stripe.Checkout.Session) {
  try {
    const parsed = JSON.parse(session.metadata?.invoice_ids || '[]')
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

function checkoutPaymentReference(session: Stripe.Checkout.Session) {
  if (typeof session.payment_intent === 'string') return session.payment_intent
  return session.payment_intent?.id || session.id
}

function checkoutPaymentMethod(session: Stripe.Checkout.Session, processing = false) {
  const isAch = session.payment_method_types?.includes('us_bank_account')
  if (isAch) return processing ? 'Online ACH processing' : 'Online ACH'
  return processing ? 'Online payment processing' : 'Online card'
}

function paymentIntentInvoiceIds(intent: Stripe.PaymentIntent) {
  try {
    const parsed = JSON.parse(intent.metadata.invoice_ids || '[]')
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

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

  async function loadAndVerifyCheckoutInvoices(session: Stripe.Checkout.Session) {
    const invoiceIds = checkoutInvoiceIds(session)
    if (invoiceIds.length === 0) return null

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
    const processingFeeCents = Math.max(0, Math.round(Number(session.metadata?.processing_fee_cents || 0)))
    const camperIds = new Set(invoices.map((invoice) => String(invoice.camper_id)))

    if (
      expectedAmount + processingFeeCents !== session.amount_total ||
      camperIds.size !== 1 ||
      (session.metadata?.camper_id && !camperIds.has(session.metadata.camper_id))
    ) {
      throw new Error('Stripe payment verification failed.')
    }

    return { invoiceIds, invoices }
  }

  async function notifyDuplicatePayment(paymentReference: string, amountCents: number, invoices: any[]) {
    const firstInvoice = invoices[0]
    const invoiceNumbers = invoices.map((invoice) => invoice.invoice_number).join(', ')
    const amount = Number(amountCents || 0) / 100
    const { data: existingAlerts, error: existingAlertError } = await supabaseAdmin
      .from('admin_notifications')
      .select('id')
      .eq('source_table', 'stripe_payment_intents')
      .eq('source_id', paymentReference)
      .limit(1)

    if (existingAlertError && existingAlertError.code !== '42P01' && existingAlertError.code !== 'PGRST205') {
      throw existingAlertError
    }
    if (existingAlerts?.length) return

    await createAdminNotification(supabaseAdmin, {
      type: 'payment_received',
      title: 'Duplicate Stripe payment — refund needed',
      message: `Stripe received another ${amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })} payment for invoice ${invoiceNumbers}. Review and refund the duplicate payment ${paymentReference}.`,
      camper_id: firstInvoice?.camper_id || null,
      source_table: 'stripe_payment_intents',
      source_id: paymentReference,
    })
  }

  async function markCheckoutPaid(session: Stripe.Checkout.Session) {
    const verified = await loadAndVerifyCheckoutInvoices(session)
    if (!verified) return

    const { invoiceIds, invoices } = verified
    const paymentReference = checkoutPaymentReference(session)
    const alreadyPaid = invoices.some((invoice) => invoice.status === 'paid')

    if (alreadyPaid) {
      const samePayment = invoices.every((invoice) => invoice.payment_reference === paymentReference)
      if (!samePayment) await notifyDuplicatePayment(paymentReference, Number(session.amount_total || 0), invoices)
      return
    }

    const { data: updatedInvoices, error: updateError } = await supabaseAdmin
      .from('invoices')
      .update({
        status: 'paid',
        paid_at: new Date().toISOString(),
        payment_method: checkoutPaymentMethod(session),
        payment_reference: paymentReference,
      })
      .in('id', invoiceIds)
      .neq('status', 'paid')
      .select('id')

    if (updateError) throw updateError
    if (!updatedInvoices || updatedInvoices.length !== invoiceIds.length) {
      await notifyDuplicatePayment(paymentReference, Number(session.amount_total || 0), invoices)
      return
    }

    const amountPaid = invoices.reduce((sum, invoice) => sum + Number(invoice.total_due || 0), 0)

    await sendPaymentReceivedAlert({
      admin: supabaseAdmin,
      invoiceIds,
      camperId: invoices[0]?.camper_id,
      amountPaid,
      paymentType: 'Online payment',
      origin: getSiteUrl(),
    })
  }

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
          const savedPaymentMethod = await stripe.paymentMethods.retrieve(paymentMethod)
          const autopayPaymentMethod = savedPaymentMethod.type === 'us_bank_account'
            ? 'ach'
            : savedPaymentMethod.type === 'card'
              ? 'card'
              : savedPaymentMethod.type
          const customer = await stripe.customers.retrieve(session.customer)

          if (!customer.deleted) {
            await stripe.customers.update(session.customer, {
              invoice_settings: { default_payment_method: paymentMethod },
              metadata: {
                ...customer.metadata,
                autopay_enabled: 'true',
                autopay_preference: session.metadata.autopay_preference || 'both',
                autopay_payment_method: autopayPaymentMethod,
              },
            })
          }
        }
      }

      if (session.mode === 'payment' && session.metadata?.purpose === 'invoice_payment') {
        if (session.payment_status === 'paid') {
          await markCheckoutPaid(session)
        } else {
          const verified = await loadAndVerifyCheckoutInvoices(session)

          if (verified) {
            const paymentReference = checkoutPaymentReference(session)
            const hasAnotherProcessingPayment = verified.invoices.some(
              (invoice) => invoice.status === 'processing' && invoice.payment_reference !== paymentReference
            )

            if (hasAnotherProcessingPayment) {
              await notifyDuplicatePayment(paymentReference, Number(session.amount_total || 0), verified.invoices)
            } else if (!verified.invoices.some((invoice) => invoice.status === 'paid')) {
              const { error: processingError } = await supabaseAdmin
                .from('invoices')
                .update({
                  status: 'processing',
                  paid_at: null,
                  payment_method: checkoutPaymentMethod(session, true),
                  payment_reference: paymentReference,
                })
                .in('id', verified.invoiceIds)
                .neq('status', 'paid')

              if (processingError) throw processingError
            }
          }
        }
      }
    }

    if (event.type === 'checkout.session.async_payment_succeeded') {
      const session = event.data.object as Stripe.Checkout.Session
      if (session.mode === 'payment' && session.metadata?.purpose === 'invoice_payment') {
        await markCheckoutPaid(session)
      }
    }

    if (event.type === 'checkout.session.async_payment_failed') {
      const session = event.data.object as Stripe.Checkout.Session
      const invoiceIds = checkoutInvoiceIds(session)
      const paymentReference = checkoutPaymentReference(session)

      if (session.metadata?.purpose === 'invoice_payment' && invoiceIds.length > 0) {
        const { error: failedPaymentError } = await supabaseAdmin
          .from('invoices')
          .update({
            status: 'sent',
            paid_at: null,
            payment_method: null,
            payment_reference: null,
          })
          .in('id', invoiceIds)
          .eq('status', 'processing')
          .eq('payment_reference', paymentReference)

        if (failedPaymentError) throw failedPaymentError
      }
    }

    if (event.type === 'payment_intent.succeeded') {
      const intent = event.data.object as Stripe.PaymentIntent
      const invoiceId = intent.metadata.invoice_id

      if (intent.metadata.purpose === 'invoice_payment') {
        const invoiceIds = paymentIntentInvoiceIds(intent)

        if (invoiceIds.length > 0) {
          const { data: invoices, error: invoiceLookupError } = await supabaseAdmin
            .from('invoices')
            .select('*')
            .in('id', invoiceIds)

          if (invoiceLookupError || !invoices || invoices.length !== invoiceIds.length) {
            throw new Error('Unable to verify paid invoices.')
          }

          const invoiceSubtotalCents = invoices.reduce(
            (sum, invoice) => sum + Math.round(Number(invoice.total_due || 0) * 100),
            0
          )
          const processingFeeCents = Math.max(0, Math.round(Number(intent.metadata.processing_fee_cents || 0)))
          const camperIds = new Set(invoices.map((invoice) => String(invoice.camper_id)))
          const receivedAmount = intent.amount_received || intent.amount

          if (
            invoiceSubtotalCents + processingFeeCents !== receivedAmount ||
            camperIds.size !== 1 ||
            (intent.metadata.camper_id && !camperIds.has(intent.metadata.camper_id))
          ) {
            throw new Error('Stripe payment verification failed.')
          }

          const alreadyPaid = invoices.some((invoice) => invoice.status === 'paid')

          if (alreadyPaid) {
            const samePayment = invoices.every((invoice) => invoice.payment_reference === intent.id)
            if (!samePayment) await notifyDuplicatePayment(intent.id, receivedAmount, invoices)
          } else {
            const isAch = intent.payment_method_types.includes('us_bank_account')
            const { data: updatedInvoices, error: invoiceUpdateError } = await supabaseAdmin
              .from('invoices')
              .update({
                status: 'paid',
                paid_at: new Date().toISOString(),
                payment_method: isAch ? 'Online ACH' : 'Online card',
                payment_reference: intent.id,
              })
              .in('id', invoiceIds)
              .neq('status', 'paid')
              .select('id')

            if (invoiceUpdateError) throw invoiceUpdateError

            if (!updatedInvoices || updatedInvoices.length !== invoiceIds.length) {
              await notifyDuplicatePayment(intent.id, receivedAmount, invoices)
            } else {
              await sendPaymentReceivedAlert({
                admin: supabaseAdmin,
                invoiceIds,
                camperId: invoices[0]?.camper_id,
                amountPaid: invoiceSubtotalCents / 100,
                paymentType: 'Online payment',
                origin: getSiteUrl(),
              })
            }
          }
        }
      }

      if (intent.metadata.purpose === 'autopay_invoice' && invoiceId) {
        const { data: invoice, error: invoiceLookupError } = await supabaseAdmin
          .from('invoices')
          .select('*')
          .eq('id', invoiceId)
          .single()

        if (invoiceLookupError) throw invoiceLookupError

        if (invoice.status === 'paid') {
          if (invoice.payment_reference !== intent.id) {
            await notifyDuplicatePayment(intent.id, intent.amount_received || intent.amount, [invoice])
          }
          return NextResponse.json({ received: true, alreadyPaid: true })
        }

        const { data: updatedInvoices, error } = await supabaseAdmin
          .from('invoices')
          .update({
            status: 'paid',
            paid_at: new Date().toISOString(),
            payment_method: intent.metadata.autopay_payment_method === 'us_bank_account' || intent.metadata.autopay_payment_method === 'ach'
              ? 'AutoPay ACH'
              : intent.metadata.autopay_payment_method === 'card'
                ? 'AutoPay card'
                : 'AutoPay',
            payment_reference: intent.id,
          })
          .eq('id', invoiceId)
          .neq('status', 'paid')
          .select('id')

        if (error) throw error
        if (!updatedInvoices?.length) {
          await notifyDuplicatePayment(intent.id, intent.amount_received || intent.amount, [invoice])
          return NextResponse.json({ received: true, duplicatePayment: true })
        }

        const amountPaid = Number(invoice?.total_due || 0)

        await sendPaymentReceivedAlert({
          admin: supabaseAdmin,
          invoiceIds: [String(invoiceId)],
          camperId: invoice?.camper_id,
          amountPaid,
          paymentType: 'AutoPay',
          origin: getSiteUrl(),
        })
      }
    }

    if (event.type === 'payment_intent.payment_failed' || event.type === 'payment_intent.canceled') {
      const intent = event.data.object as Stripe.PaymentIntent
      const invoiceIds = paymentIntentInvoiceIds(intent)

      if (intent.metadata.purpose === 'invoice_payment' && invoiceIds.length > 0) {
        const { error: failedIntentError } = await supabaseAdmin
          .from('invoices')
          .update({
            status: 'sent',
            paid_at: null,
            payment_method: null,
            payment_reference: null,
          })
          .in('id', invoiceIds)
          .eq('status', 'processing')
          .eq('payment_reference', intent.id)

        if (failedIntentError) throw failedIntentError
      }

      if (intent.metadata.purpose === 'autopay_invoice' && intent.metadata.invoice_id) {
        const { error: failedAutoPayError } = await supabaseAdmin
          .from('invoices')
          .update({
            status: 'sent',
            paid_at: null,
            payment_method: null,
            payment_reference: null,
          })
          .eq('id', intent.metadata.invoice_id)
          .eq('status', 'processing')
          .eq('payment_reference', intent.id)

        if (failedAutoPayError) throw failedAutoPayError
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
