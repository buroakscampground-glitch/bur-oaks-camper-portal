import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { calculateCardProcessingFeeCents, loadPaymentFeeSettings } from '../../../lib/payment-fees'
import { getSiteUrl } from '../../../lib/site-url'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ONE_TIME_KEY = 'c94cc97360d24ba8ba1d918434671b87'

function authorized(request: Request) {
  return request.headers.get('x-one-time-key') === ONE_TIME_KEY
}

function validEmail(value: unknown) {
  const email = String(value || '').trim().toLowerCase()
  return /^\S+@\S+\.\S+$/.test(email) && !email.endsWith('@no-email.buroaks.local') ? email : ''
}

function isCharlie(row: any) {
  const lot = String(row?.lot_number || '').replace(/^lot\s*/i, '').trim()
  const first = String(row?.first_name || '').trim().toLowerCase()
  const last = String(row?.last_name || '').trim().toLowerCase()
  return lot === '47' && ['charlie', 'charles'].includes(first) && ['kimbal', 'kimball'].includes(last)
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: 'Not found.' }, { status: 404 })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const stripeKey = process.env.STRIPE_SECRET_KEY
  if (!url || !serviceKey || !stripeKey) {
    return NextResponse.json({ error: 'Production payment services are not configured.' }, { status: 500 })
  }

  const admin = createClient(url, serviceKey)
  try {
    const { data: candidates, error: camperError } = await admin
      .from('campers')
      .select('id,lot_number,first_name,last_name,email,secondary_email,active,role')
      .ilike('lot_number', '47')
    if (camperError) throw camperError
    const matches = (candidates || []).filter(isCharlie).filter((row: any) => row.active !== false)
    if (matches.length !== 1) {
      return NextResponse.json({ error: `Expected one active Charlie Kimball record at Lot 47; found ${matches.length}.` }, { status: 409 })
    }
    const camper = matches[0]

    const [{ data: invoices, error: invoiceError }, { data: reminders, error: reminderError }] = await Promise.all([
      admin
        .from('invoices')
        .select('id,invoice_number,invoice_type,total_due,due_date,status,created_at')
        .eq('camper_id', camper.id)
        .order('due_date', { ascending: false }),
      admin
        .from('text_reminders')
        .select('reminder_type,status,sent_at,error_message,recipient_phone')
        .eq('camper_id', camper.id)
        .order('sent_at', { ascending: false })
        .limit(20),
    ])
    if (invoiceError || reminderError) throw invoiceError || reminderError

    const emails = Array.from(new Set([validEmail(camper.email), validEmail(camper.secondary_email)].filter(Boolean)))
    const { data: authData, error: authError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    if (authError) throw authError
    const authUsers = (authData?.users || []).filter((user) => emails.includes(String(user.email || '').trim().toLowerCase()))

    const stripe = new Stripe(stripeKey)
    const stripeCustomers = [] as Array<{ id: string; email: string | null; phone: string | null; metadata: Stripe.Metadata }>
    for (const email of emails) {
      const result = await stripe.customers.list({ email, limit: 10 })
      stripeCustomers.push(...result.data.map((customer) => ({
        id: customer.id,
        email: customer.email,
        phone: customer.phone || null,
        metadata: customer.metadata,
      })))
    }

    return NextResponse.json({
      camper: {
        id: camper.id,
        lotNumber: camper.lot_number,
        name: `${camper.first_name || ''} ${camper.last_name || ''}`.trim(),
        emails,
      },
      authUsers: authUsers.map((user) => ({ id: user.id, email: user.email, confirmedAt: user.email_confirmed_at, lastSignInAt: user.last_sign_in_at })),
      invoices: invoices || [],
      reminders: (reminders || []).map((row: any) => ({
        reminderType: row.reminder_type,
        status: row.status,
        sentAt: row.sent_at,
        error: row.error_message,
        phoneEnding: String(row.recipient_phone || '').replace(/\D/g, '').slice(-4),
      })),
      stripeCustomers,
    })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Unable to audit Charlie Kimball payment access.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: 'Not found.' }, { status: 404 })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const stripeKey = process.env.STRIPE_SECRET_KEY
  if (!url || !serviceKey || !stripeKey) {
    return NextResponse.json({ error: 'Production payment services are not configured.' }, { status: 500 })
  }

  const admin = createClient(url, serviceKey)
  try {
    const { data: candidates, error: camperError } = await admin
      .from('campers')
      .select('id,lot_number,first_name,last_name,email,secondary_email,active')
      .ilike('lot_number', '47')
    if (camperError) throw camperError
    const matches = (candidates || []).filter(isCharlie).filter((row: any) => row.active !== false)
    if (matches.length !== 1) throw new Error(`Expected one active Charlie Kimball record; found ${matches.length}.`)
    const camper = matches[0]

    const { data: invoices, error: invoiceError } = await admin
      .from('invoices')
      .select('id,invoice_number,invoice_type,total_due,status,camper_id')
      .eq('camper_id', camper.id)
      .eq('status', 'sent')
      .gt('total_due', 0)
    if (invoiceError) throw invoiceError
    if (!invoices || invoices.length !== 1) throw new Error(`Expected one payable Charlie invoice; found ${invoices?.length || 0}.`)

    const invoice = invoices[0]
    const subtotalCents = Math.round(Number(invoice.total_due) * 100)
    const feeSettings = await loadPaymentFeeSettings(admin)
    const feeCents = calculateCardProcessingFeeCents(subtotalCents, feeSettings)
    const lineItems = [{
      price_data: {
        currency: 'usd',
        product_data: { name: `${invoice.invoice_type || 'Invoice'} — ${invoice.invoice_number}` },
        unit_amount: subtotalCents,
      },
      quantity: 1,
    }]
    if (feeCents > 0) {
      lineItems.push({
        price_data: {
          currency: 'usd',
          product_data: { name: `${feeSettings.label} — online card checkout only` },
          unit_amount: feeCents,
        },
        quantity: 1,
      })
    }

    const payerEmail = validEmail(camper.email) || validEmail(camper.secondary_email)
    const origin = getSiteUrl()
    const stripe = new Stripe(stripeKey)
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: lineItems,
      success_url: `${origin}/success`,
      cancel_url: `${origin}/invoices`,
      client_reference_id: `diagnostic-${camper.id}`,
      customer_email: payerEmail || undefined,
      phone_number_collection: { enabled: true },
      wallet_options: { link: { display: 'never' } },
      payment_method_types: ['card'],
      metadata: {
        invoice_ids: JSON.stringify([invoice.id]),
        camper_id: camper.id,
        paid_by_email: payerEmail,
        billing_access: 'camper',
        purpose: 'invoice_payment',
        payment_method: 'card',
        invoice_subtotal_cents: String(subtotalCents),
        processing_fee_cents: String(feeCents),
      },
      payment_intent_data: {
        metadata: {
          invoice_ids: JSON.stringify([invoice.id]),
          camper_id: camper.id,
          paid_by_email: payerEmail,
          billing_access: 'camper',
          purpose: 'invoice_payment',
          payment_method: 'card',
          invoice_subtotal_cents: String(subtotalCents),
          processing_fee_cents: String(feeCents),
        },
      },
    })

    return NextResponse.json({ success: true, invoiceId: invoice.id, checkoutId: session.id, checkoutUrl: session.url })
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error?.message || 'Unable to create Charlie checkout.',
      code: error?.code || null,
      type: error?.type || null,
    }, { status: 500 })
  }
}
