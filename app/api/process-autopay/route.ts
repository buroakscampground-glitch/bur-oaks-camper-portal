import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getAuthenticatedContext } from '../../../lib/server-auth'
import { checkRateLimit } from '../../../lib/rate-limit'
import { sendPaymentReceivedAlert } from '../../../lib/payment-alerts'

export const runtime = 'nodejs'

function invoiceCategory(invoiceType: string) {
  const type = invoiceType.toLowerCase()

  if (type.includes('electric')) return 'electric'
  if (type.includes('rent')) return 'rent'
  return null
}

export async function POST(request: Request) {
  const rateLimit = checkRateLimit(request, 'process-autopay', 60, 60_000)
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many AutoPay processing requests.' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfter) } }
    )
  }

  try {
    const context = await getAuthenticatedContext(request)

    if (!context || String(context.camper.role).toLowerCase() !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { invoiceId } = await request.json()

    if (!invoiceId) {
      return NextResponse.json({ error: 'Missing invoice ID.' }, { status: 400 })
    }

    const { data: invoice } = await context.admin
      .from('invoices')
      .select('*')
      .eq('id', invoiceId)
      .single()

    if (!invoice || invoice.status === 'paid') {
      return NextResponse.json({ charged: false, reason: 'not_open' })
    }

    const category = invoiceCategory(invoice.invoice_type || '')

    if (!category) {
      return NextResponse.json({ charged: false, reason: 'not_eligible' })
    }

    const { data: camper } = await context.admin
      .from('campers')
      .select('id,email,first_name,last_name')
      .eq('id', invoice.camper_id)
      .single()

    if (!camper?.email) {
      return NextResponse.json({ charged: false, reason: 'camper_not_found' })
    }

    const key = process.env.STRIPE_SECRET_KEY

    if (!key) {
      throw new Error('Stripe is not configured.')
    }

    const stripe = new Stripe(key)
    const customers = await stripe.customers.list({ email: camper.email, limit: 10 })
    const customer =
      customers.data.find(
        (item) => item.metadata.camper_id === String(camper.id)
      ) || customers.data[0]

    const preference = customer?.metadata.autopay_preference
    const eligible =
      customer?.metadata.autopay_enabled === 'true' &&
      (preference === 'both' || preference === category)
    const paymentMethod = customer?.invoice_settings.default_payment_method

    if (!customer || !eligible || typeof paymentMethod !== 'string') {
      return NextResponse.json({ charged: false, reason: 'not_enrolled' })
    }

    const amount = Math.round(Number(invoice.total_due || 0) * 100)

    if (!Number.isInteger(amount) || amount < 50) {
      return NextResponse.json({ charged: false, reason: 'invalid_amount' })
    }

    const intent = await stripe.paymentIntents.create(
      {
        amount,
        currency: 'usd',
        customer: customer.id,
        payment_method: paymentMethod,
        confirm: true,
        off_session: true,
        receipt_email: camper.email,
        description: `${invoice.invoice_type} - Invoice ${invoice.invoice_number}`,
        metadata: {
          purpose: 'autopay_invoice',
          invoice_id: String(invoice.id),
          invoice_number: String(invoice.invoice_number),
          camper_id: String(camper.id),
        },
      },
      { idempotencyKey: `autopay-invoice-${invoice.id}` }
    )

    if (intent.status === 'succeeded') {
      await context.admin
        .from('invoices')
        .update({
          status: 'paid',
          paid_at: new Date().toISOString(),
          payment_method: 'AutoPay',
          payment_reference: intent.id,
        })
        .eq('id', invoice.id)

      const alertResult = await sendPaymentReceivedAlert({
        admin: context.admin,
        invoiceIds: [String(invoice.id)],
        camperId: invoice.camper_id,
        amountPaid: Number(invoice.total_due || 0),
        paymentType: 'AutoPay',
        origin: new URL(request.url).origin,
      })

      return NextResponse.json({ charged: true, paymentIntentId: intent.id, ...alertResult })
    }

    return NextResponse.json({ charged: false, reason: intent.status })
  } catch (error: any) {
    console.error('PROCESS AUTOPAY ERROR:', error)
    return NextResponse.json(
      {
        charged: false,
        error:
          error.code === 'authentication_required'
            ? 'The saved card requires customer verification. The invoice remains open.'
            : error.message || 'AutoPay charge failed. The invoice remains open.',
      },
      { status: 500 }
    )
  }
}
