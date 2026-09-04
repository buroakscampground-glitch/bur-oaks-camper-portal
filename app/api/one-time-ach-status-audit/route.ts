import { createHash } from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import Stripe from 'stripe'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function fingerprint(value: string) {
  return createHash('sha256').update(value).digest('hex').slice(0, 16)
}

export async function GET() {
  const stripeKey = process.env.STRIPE_SECRET_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!stripeKey || !serviceRoleKey || !supabaseUrl) {
    return NextResponse.json({ error: 'Status check is not configured.' }, { status: 500 })
  }

  const admin = createClient(supabaseUrl, serviceRoleKey)
  const { data, error } = await admin
    .from('invoices')
    .select('payment_reference')
    .eq('status', 'processing')
    .ilike('payment_method', '%ACH%')
    .not('payment_reference', 'is', null)

  if (error) return NextResponse.json({ error: 'Unable to load processing payments.' }, { status: 500 })

  const references = Array.from(new Set(
    (data || []).map((invoice) => String(invoice.payment_reference || '')).filter((value) => value.startsWith('pi_'))
  ))
  const stripe = new Stripe(stripeKey)
  const statuses = await Promise.all(references.map(async (reference) => {
    const intent = await stripe.paymentIntents.retrieve(reference)
    return {
      fingerprint: fingerprint(reference),
      status: intent.status,
      created: new Date(intent.created * 1000).toISOString(),
      failureCode: intent.last_payment_error?.code || null,
      failureType: intent.last_payment_error?.type || null,
    }
  }))

  return NextResponse.json({ checkedAt: new Date().toISOString(), statuses }, {
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  })
}
