import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import Stripe from 'stripe'

const oneTimeKey = 'cheryl-payment-audit-4fd93c71'

export async function GET(request: Request) {
  if (request.headers.get('x-one-time-key') !== oneTimeKey) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const stripeKey = process.env.STRIPE_SECRET_KEY
  if (!supabaseUrl || !serviceRoleKey || !stripeKey) {
    return NextResponse.json({ error: 'Server configuration is incomplete.' }, { status: 500 })
  }

  const admin = createClient(supabaseUrl, serviceRoleKey)
  const stripe = new Stripe(stripeKey)
  const { data: campers, error: camperError } = await admin
    .from('campers')
    .select('id,first_name,last_name,lot_number')
    .or('first_name.ilike.%Cheryl%,last_name.ilike.%Brinson%')

  if (camperError) return NextResponse.json({ error: camperError.message }, { status: 500 })

  const results = []
  for (const camper of campers || []) {
    const [{ data: invoices, error: invoiceError }, { data: alerts, error: alertError }] = await Promise.all([
      admin
        .from('invoices')
        .select('id,invoice_number,total_due,status,paid_at,payment_method,payment_reference,created_at,due_date')
        .eq('camper_id', camper.id)
        .order('created_at', { ascending: false }),
      admin
        .from('admin_notifications')
        .select('id,title,message,source_id,created_at,read_at')
        .eq('camper_id', camper.id)
        .order('created_at', { ascending: false })
        .limit(30),
    ])
    if (invoiceError || alertError) {
      return NextResponse.json({ error: invoiceError?.message || alertError?.message }, { status: 500 })
    }

    const references = Array.from(new Set([
      ...(invoices || []).map((invoice) => String(invoice.payment_reference || '')),
      ...(alerts || []).map((alert) => String(alert.source_id || '')),
    ].filter((reference) => reference.startsWith('pi_'))))

    const stripePayments = []
    for (const reference of references) {
      try {
        const intent = await stripe.paymentIntents.retrieve(reference)
        stripePayments.push({
          id: intent.id,
          status: intent.status,
          amount: intent.amount,
          amount_received: intent.amount_received,
          created: intent.created,
          invoice_ids: intent.metadata.invoice_ids || null,
        })
      } catch (error) {
        stripePayments.push({ id: reference, error: error instanceof Error ? error.message : 'Lookup failed.' })
      }
    }

    results.push({ camper, invoices: invoices || [], alerts: alerts || [], stripePayments })
  }

  return NextResponse.json({ results })
}

export async function POST(request: Request) {
  if (request.headers.get('x-one-time-key') !== oneTimeKey) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const stripeKey = process.env.STRIPE_SECRET_KEY
  if (!supabaseUrl || !serviceRoleKey || !stripeKey) {
    return NextResponse.json({ error: 'Server configuration is incomplete.' }, { status: 500 })
  }

  const admin = createClient(supabaseUrl, serviceRoleKey)
  const stripe = new Stripe(stripeKey)
  const notificationId = 'bbd8cf58-c971-4aa1-925f-d0918a487a42'
  const { data: alert, error: alertError } = await admin
    .from('admin_notifications')
    .select('id,title,source_id')
    .eq('id', notificationId)
    .maybeSingle()
  if (alertError) return NextResponse.json({ error: alertError.message }, { status: 500 })
  if (!alert) return NextResponse.json({ removed: false, reason: 'Alert is already gone.' })

  const { data: invoice, error: invoiceError } = await admin
    .from('invoices')
    .select('id,status,payment_reference')
    .eq('payment_reference', alert.source_id)
    .eq('status', 'paid')
    .maybeSingle()
  if (invoiceError) return NextResponse.json({ error: invoiceError.message }, { status: 500 })
  if (!invoice || alert.title !== 'Duplicate Stripe payment — refund needed') {
    return NextResponse.json({ removed: false, reason: 'Safety check did not match.' }, { status: 409 })
  }

  const intent = await stripe.paymentIntents.retrieve(String(alert.source_id))
  if (intent.status !== 'succeeded') {
    return NextResponse.json({ removed: false, reason: 'Stripe payment is not successful.' }, { status: 409 })
  }

  const { error: deleteError } = await admin.from('admin_notifications').delete().eq('id', notificationId)
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 })
  return NextResponse.json({ removed: true, paymentReference: intent.id, invoiceId: invoice.id })
}
