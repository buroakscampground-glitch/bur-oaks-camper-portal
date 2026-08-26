import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createHash } from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { getAuthenticatedContext } from '../../../lib/server-auth'
import { verifyFinalInvoiceToken } from '../../../lib/final-invoice-token'
import { checkRateLimit } from '../../../lib/rate-limit'
import {
  achProcessingFeeLabel,
  calculateAchProcessingFeeCents,
  calculateCardProcessingFeeCents,
  loadPaymentFeeSettings,
} from '../../../lib/payment-fees'
import { getSiteUrl } from '../../../lib/site-url'
import { loadAuthorizedBillingCampers } from '../../../lib/authorized-billing'

export const runtime = 'nodejs'

type CheckoutInvoice = {
  id: string
  invoice_number: string | null
  invoice_type: string | null
  total_due: number | string | null
  status: string | null
  camper_id: string
}

export async function POST(request: Request) {
  const rateLimit = await checkRateLimit(request, 'checkout', 10, 60_000)
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many checkout attempts. Please wait a moment.' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfter) } }
    )
  }

  try {
    const body = await request.json()
    const paymentMethod = body.paymentMethod === 'ach' ? 'ach' : 'card'
    const finalInvoiceToken = typeof body.finalInvoiceToken === 'string' ? body.finalInvoiceToken : ''
    const finalPayload = finalInvoiceToken ? verifyFinalInvoiceToken(finalInvoiceToken) : null
    let requestedIds = Array.isArray(body.invoiceIds)
      ? Array.from(new Set(body.invoiceIds.filter((id: unknown) => typeof id === 'string')))
      : []
    let admin: any
    let payerId = ''
    let payerEmail = ''
    let billingAccess = 'camper'
    let allowedCamperIds = new Set<string>()
    let accountCamperId = ''

    if (finalInvoiceToken) {
      if (!finalPayload) {
        return NextResponse.json({ error: 'This final-invoice payment link is invalid or expired.' }, { status: 410 })
      }

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
      if (!supabaseUrl || !serviceRoleKey) throw new Error('Final billing is not configured.')

      admin = createClient(supabaseUrl, serviceRoleKey)
      requestedIds = [finalPayload.invoiceId]
      allowedCamperIds = new Set([finalPayload.camperId])
      payerId = `final-${finalPayload.camperId}`
      billingAccess = 'archived_final_invoice'
    } else {
      const context = await getAuthenticatedContext(request)
      if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

      admin = context.admin
      payerId = context.user.id
      payerEmail = context.user.email || ''
      accountCamperId = String(context.camper.id)
      const delegatedCampers = await loadAuthorizedBillingCampers(admin, context.user.email)
      allowedCamperIds = new Set([
        String(context.camper.id),
        ...delegatedCampers.map((camper: any) => String(camper.id)),
      ])
    }

    if (requestedIds.length === 0 || requestedIds.length > 20) {
      return NextResponse.json(
        { error: 'Select between 1 and 20 invoices.' },
        { status: 400 }
      )
    }

    const { data: invoiceData, error: invoiceError } = await admin
      .from('invoices')
      .select('id,invoice_number,invoice_type,total_due,status,camper_id')
      .in('id', requestedIds)
    const invoices = (invoiceData || []) as CheckoutInvoice[]

    if (invoiceError) {
      throw invoiceError
    }

    if (
      invoices.length !== requestedIds.length ||
      invoices.some((invoice) => !allowedCamperIds.has(String(invoice.camper_id)))
    ) {
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

    const invoiceCamperIds = new Set(invoices.map((invoice) => String(invoice.camper_id)))
    if (invoiceCamperIds.size !== 1) {
      return NextResponse.json(
        { error: 'Pay invoices for one site at a time.' },
        { status: 400 }
      )
    }

    const billedCamperId = String(invoices[0].camper_id)

    if (finalPayload) {
      const { data: finalCamper, error: finalCamperError } = await admin
        .from('campers')
        .select('id,email,secondary_email,active')
        .eq('id', finalPayload.camperId)
        .single()

      if (finalCamperError || !finalCamper || finalCamper.active !== false) {
        return NextResponse.json({ error: 'This final-billing payment link is closed.' }, { status: 410 })
      }

      payerEmail = [finalCamper.email, finalCamper.secondary_email]
        .map((value) => String(value || '').trim().toLowerCase())
        .find((value) => /^\S+@\S+\.\S+$/.test(value)) || ''
    } else if (!allowedCamperIds.has(billedCamperId)) {
      return NextResponse.json({ error: 'This invoice is not available to this account.' }, { status: 403 })
    }

    const delegatedPayment = billingAccess !== 'archived_final_invoice' && billedCamperId !== accountCamperId

    const invoiceSubtotalCents = invoices.reduce((sum, invoice) => {
      return sum + Math.round(Number(invoice.total_due || 0) * 100)
    }, 0)
    const feeSettings = await loadPaymentFeeSettings(admin)
    const processingFeeCents = paymentMethod === 'card'
      ? calculateCardProcessingFeeCents(invoiceSubtotalCents, feeSettings)
      : calculateAchProcessingFeeCents(invoiceSubtotalCents)

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
            name: paymentMethod === 'ach'
              ? achProcessingFeeLabel
              : `${feeSettings.label} — online card checkout only`,
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
    const finalReturnUrl = finalInvoiceToken
      ? `${origin}/final-invoice/${encodeURIComponent(finalInvoiceToken)}`
      : ''
    const verifiedInvoiceIds = invoices.map((invoice) => String(invoice.id))
    const checkoutWindow = Math.floor(Date.now() / (60 * 60 * 1000))
    const checkoutFingerprint = createHash('sha256')
      .update([
        billedCamperId,
        [...verifiedInvoiceIds].sort().join(','),
        String(invoiceSubtotalCents),
        String(processingFeeCents),
        paymentMethod,
        String(checkoutWindow),
      ].join('|'))
      .digest('hex')
      .slice(0, 40)
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: lineItems,
      success_url: finalReturnUrl ? `${finalReturnUrl}?payment=success` : `${origin}/success`,
      cancel_url: finalReturnUrl || `${origin}/invoices`,
      client_reference_id: payerId,
      customer_email: payerEmail || undefined,
      payment_method_types: paymentMethod === 'ach' ? ['us_bank_account'] : ['card'],
      ...(paymentMethod === 'ach' ? { customer_creation: 'always' as const } : {}),
      metadata: {
        invoice_ids: JSON.stringify(verifiedInvoiceIds),
        camper_id: billedCamperId,
        paid_by_email: payerEmail,
        billing_access: billingAccess === 'archived_final_invoice' ? billingAccess : delegatedPayment ? 'authorized_family_payer' : 'camper',
        purpose: 'invoice_payment',
        payment_method: paymentMethod,
        invoice_subtotal_cents: String(invoiceSubtotalCents),
        processing_fee_cents: String(processingFeeCents),
      },
      payment_intent_data: {
        metadata: {
          invoice_ids: JSON.stringify(verifiedInvoiceIds),
          camper_id: billedCamperId,
          paid_by_email: payerEmail,
          billing_access: billingAccess === 'archived_final_invoice' ? billingAccess : delegatedPayment ? 'authorized_family_payer' : 'camper',
          purpose: 'invoice_payment',
          payment_method: paymentMethod,
          invoice_subtotal_cents: String(invoiceSubtotalCents),
          processing_fee_cents: String(processingFeeCents),
        },
      },
    }, {
      idempotencyKey: `invoice-checkout-${checkoutFingerprint}`,
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
