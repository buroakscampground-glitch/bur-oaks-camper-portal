import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import Stripe from 'stripe'

export const runtime = 'nodejs'

const ONE_TIME_KEY = '465596e0dd9d43228bd8b6328489c64f'
const PHONE = '+16189464372'
const MARKER = 'one-time-quinn-payment-phone-2026-09-05'

function validEmail(value: unknown) {
  const email = String(value || '').trim().toLowerCase()
  return /^\S+@\S+\.\S+$/.test(email) && !email.endsWith('@no-email.buroaks.local') ? email : ''
}

export async function POST(request: Request) {
  if (request.headers.get('x-one-time-key') !== ONE_TIME_KEY) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const stripeKey = process.env.STRIPE_SECRET_KEY
  if (!url || !serviceKey || !stripeKey) {
    return NextResponse.json({ error: 'Production payment services are not configured.' }, { status: 500 })
  }

  const admin = createClient(url, serviceKey)
  const { data: prior } = await admin.from('admin_notifications').select('id').eq('source_table', MARKER).limit(1)
  if (prior?.length) return NextResponse.json({ success: true, alreadyApplied: true, phone: '***-***-4372' })

  const { data: matches, error: camperError } = await admin
    .from('campers')
    .select('id,lot_number,first_name,last_name,email,secondary_email,phone,alternate_phone,second_profile_phone,active')
    .ilike('lot_number', 'FF17')
    .ilike('last_name', 'Quinn')
    .eq('active', true)
  if (camperError) return NextResponse.json({ error: camperError.message }, { status: 500 })
  if (!matches || matches.length !== 1) {
    return NextResponse.json({ error: `Expected one active Quinn record at FF17; found ${matches?.length || 0}.` }, { status: 409 })
  }

  const camper = matches[0]
  const { error: updateError } = await admin
    .from('campers')
    .update({ second_profile_phone: PHONE })
    .eq('id', camper.id)
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  const stripe = new Stripe(stripeKey)
  const emails = Array.from(new Set([validEmail(camper.email), validEmail(camper.secondary_email)].filter(Boolean)))
  const customers = [] as Stripe.Customer[]
  for (const email of emails) {
    const result = await stripe.customers.list({ email, limit: 10 })
    customers.push(...result.data.filter((customer) => customer.metadata.camper_id === String(camper.id)))
  }

  const uniqueCustomers = Array.from(new Map(customers.map((customer) => [customer.id, customer])).values())
  if (!uniqueCustomers.length && emails[0]) {
    uniqueCustomers.push(await stripe.customers.create({
      email: emails[0],
      name: `${camper.first_name || ''} ${camper.last_name || ''}`.trim() || undefined,
      phone: PHONE,
      metadata: { camper_id: String(camper.id) },
    }))
  } else {
    await Promise.all(uniqueCustomers.map((customer) => stripe.customers.update(customer.id, { phone: PHONE })))
  }

  const { error: markerError } = await admin.from('admin_notifications').insert({
    type: 'payment_phone_updated',
    title: 'FF17 payment phone updated',
    message: 'The Quinn payment contact phone was updated to the number ending in 4372.',
    lot_number: 'FF17',
    camper_id: camper.id,
    source_table: MARKER,
  })
  if (markerError) return NextResponse.json({ error: markerError.message }, { status: 500 })

  return NextResponse.json({
    success: true,
    alreadyApplied: false,
    phone: '***-***-4372',
    stripeCustomersUpdated: uniqueCustomers.length,
  })
}
