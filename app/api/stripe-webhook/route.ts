import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

export async function GET() {
  return NextResponse.json({
    keys: Object.keys(process.env)
      .filter(
        (k) =>
          k.includes('STRIPE') ||
          k.includes('SUPABASE')
      )
      .sort(),
  })
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string)

export async function POST(request: Request) {
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

  if (!webhookSecret) {
    return NextResponse.json(
      { error: 'Missing STRIPE_WEBHOOK_SECRET' },
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

    const invoiceIds = JSON.parse(
      session.metadata?.invoice_ids || '[]'
    )

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

  return NextResponse.json({
    received: true,
  })
}