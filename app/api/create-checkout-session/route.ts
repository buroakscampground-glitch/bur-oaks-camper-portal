import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getAuthenticatedContext } from '../../../lib/server-auth'
import { checkRateLimit } from '../../../lib/rate-limit'
import { calculateCardProcessingFeeCents, loadPaymentFeeSettings } from '../../../lib/payment-fees'
import { getSiteUrl } from '../../../lib/site-url'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const rateLimit = await checkRateLimit(request, 'checkout', 10, 60_000)
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many checkout attempts. Please wait a moment.' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfter) } }
    )
  }

  try {
    const context = await getAuthenticatedContext(request)

    if (!context) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const requestedIds = Array.isArray(body.invoiceIds)
      ? Array.from(new Set(body.invoiceIds.filter((id: unknown) => typeof id === 'string')))
      : []

    if (requestedIds.length === 0 || requestedIds.length > 20) {
      return NextResponse.json(
        { error: 'Select between 1 and 20 invoices.' },
        { status: 400 }
      )
    }

    const { data: invoices, error: invoiceError } = await context.admin
      .from('invoices')
      .select('id,invoice_number,invoice_type,total_due,status,camper_id')
      .eq('camper_id', context.camper.id)
      .in('id', requestedIds)

    if (invoiceError) {
      throw invoiceError
    }

    if (!invoices || invoices.length !== requestedIds.length) {
      return NextResponse.json(
        { error: 'One or more invoices could not be verified.' },
        { status: 400 }
      )
    }

    if (invoices.some((invoice) => invoice.status === 'paid')) {
      return NextResponse.json(
        { error: 'One or more selected invoices are already paid.' },
        { status: 400 }
      )
    }

    if (invoices.some((invoice) => invoice.status === 'processing')) {
      return NextResponse.json(
        { error: 'A payment is already processing for one or more selected invoices. Please do not pay again.' },
        { status: 409 }
      )
    }

    const invoiceSubtotalCents = invoices.reduce((sum, invoice) => {
      return sum + Math.round(Number(invoice.total_due || 0) * 100)
    }, 0)
    const feeSettings = await loadPaymentFeeSettings(context.admin)
    const processingFeeCents = calculateCardProcessingFeeCents(invoiceSubtotalCents, feeSettings)

    const lineItems = invoices.map((invoice) => {
      const amount = Math.round(Number(invoice.total_due || 0) * 100)

      if (!Number.isInteger(amount) || amount < 50) {
        throw new Error(`Invoice ${invoice.invoice_number} has an invalid amount.`)
      }

      return {
        price_data: {
          currency: 'usd',
          product_data: {
            name: `${invoice.invoice_type || 'Invoice'} — ${invoice.invoice_number}`,
          },
          unit_amount: amount,
        },
        quantity: 1,
      }
    })

    if (processingFeeCents > 0) {
      lineItems.push({
        price_data: {
          currency: 'usd',
          product_data: {
            name: `${feeSettings.label} — online card checkout only`,
          },
          unit_amount: processingFeeCents,
        },
        quantity: 1,
      })
    }

    const key = process.env.STRIPE_SECRET_KEY

    if (!key) {
      throw new Error('Stripe is not configured.')
    }

    const stripe = new Stripe(key)
    const origin = getSiteUrl()
    const verifiedInvoiceIds = invoices.map((invoice) => String(invoice.id))
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: lineItems,
      success_url: `${origin}/success`,
      cancel_url: `${origin}/invoices`,
      client_reference_id: context.user.id,
      customer_email: context.user.email || undefined,
      metadata: {
        invoice_ids: JSON.stringify(verifiedInvoiceIds),
        camper_id: String(context.camper.id),
        purpose: 'invoice_payment',
        invoice_subtotal_cents: String(invoiceSubtotalCents),
        processing_fee_cents: String(processingFeeCents),
      },
      payment_intent_data: {
        metadata: {
          invoice_ids: JSON.stringify(verifiedInvoiceIds),
          camper_id: String(context.camper.id),
          purpose: 'invoice_payment',
          invoice_subtotal_cents: String(invoiceSubtotalCents),
          processing_fee_cents: String(processingFeeCents),
        },
      },
    })

    return NextResponse.json({ success: true, id: session.id, url: session.url })
  } catch (error) {
    console.error('Unable to create checkout session:', error)
    return NextResponse.json(
      { success: false, error: 'Unable to start secure checkout.' },
      { status: 500 }
    )
  }
}
