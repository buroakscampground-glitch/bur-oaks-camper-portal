import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getAuthenticatedContext } from '../../../lib/server-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function safePaymentError(error: Stripe.PaymentIntent.LastPaymentError | null) {
  if (!error) return null
  return {
    code: error.code || null,
    declineCode: error.decline_code || null,
    message: error.message || null,
    type: error.type || null,
  }
}

function safePaymentIntent(intent: Stripe.PaymentIntent) {
  return {
    id: intent.id,
    status: intent.status,
    amount: intent.amount,
    currency: intent.currency,
    created: intent.created,
    description: intent.description || null,
    receiptEmail: intent.receipt_email || null,
    metadata: intent.metadata,
    paymentMethodTypes: intent.payment_method_types,
    lastPaymentError: safePaymentError(intent.last_payment_error),
  }
}

export async function GET(request: Request) {
  const context = await getAuthenticatedContext(request)
  if (!context || String(context.camper.role || '').toLowerCase() !== 'admin') {
    return NextResponse.json({ error: 'Admin access is required.' }, { status: 401 })
  }

  const eventId = new URL(request.url).searchParams.get('eventId')?.trim() || ''
  const camperId = new URL(request.url).searchParams.get('camperId')?.trim() || ''
  const invoiceId = new URL(request.url).searchParams.get('invoiceId')?.trim() || ''
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  if (!eventId && !camperId && !invoiceId) {
    return NextResponse.json({ error: 'A Stripe event, camper, or invoice ID is required.' }, { status: 400 })
  }
  if (eventId && !/^evt_[A-Za-z0-9]+$/.test(eventId)) {
    return NextResponse.json({ error: 'The Stripe event ID is invalid.' }, { status: 400 })
  }
  if ((camperId && !uuidPattern.test(camperId)) || (invoiceId && !uuidPattern.test(invoiceId))) {
    return NextResponse.json({ error: 'The camper or invoice ID is invalid.' }, { status: 400 })
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY
  if (!stripeKey) {
    return NextResponse.json({ error: 'Stripe is not configured.' }, { status: 500 })
  }

  try {
    const stripe = new Stripe(stripeKey)
    if (!eventId) {
      const query = camperId
        ? `metadata['camper_id']:'${camperId}'`
        : `metadata['invoice_id']:'${invoiceId}'`
      const results = await stripe.paymentIntents.search({ query, limit: 100 })
      return NextResponse.json({
        search: { camperId: camperId || null, invoiceId: invoiceId || null },
        paymentIntents: results.data.map(safePaymentIntent),
      }, { headers: { 'Cache-Control': 'no-store' } })
    }

    const event = await stripe.events.retrieve(eventId)
    const eventObject = event.data.object as { id?: string }
    const paymentIntentId = eventObject.id?.startsWith('pi_') ? eventObject.id : null

    if (!paymentIntentId) {
      return NextResponse.json({
        event: { id: event.id, type: event.type, created: event.created },
        paymentIntent: null,
      }, { headers: { 'Cache-Control': 'no-store' } })
    }

    const intent = await stripe.paymentIntents.retrieve(paymentIntentId)
    return NextResponse.json({
      event: { id: event.id, type: event.type, created: event.created },
      paymentIntent: safePaymentIntent(intent),
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error: unknown) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unable to verify the Stripe event.',
    }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }
}
