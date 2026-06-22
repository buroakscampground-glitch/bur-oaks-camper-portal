import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getAuthenticatedContext } from '../../../lib/server-auth'
import { checkRateLimit } from '../../../lib/rate-limit'

export const runtime = 'nodejs'

const preferences = new Set(['electric', 'rent', 'both'])

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY

  if (!key) {
    throw new Error('Stripe is not configured.')
  }

  return new Stripe(key)
}

async function findCustomer(
  stripe: Stripe,
  email: string,
  userId: string
) {
  const customers = await stripe.customers.list({ email, limit: 10 })

  return (
    customers.data.find(
      (customer) => customer.metadata.supabase_user_id === userId
    ) || customers.data[0]
  )
}

export async function POST(request: Request) {
  const rateLimit = checkRateLimit(request, 'autopay', 20, 60_000)
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many AutoPay requests. Please wait a moment.' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfter) } }
    )
  }

  try {
    const context = await getAuthenticatedContext(request)

    if (!context) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const action = body.action
    const stripe = getStripe()
    const email = context.user.email!
    let customer = await findCustomer(stripe, email, context.user.id)

    if (action === 'status') {
      if (!customer) {
        return NextResponse.json({ enabled: false })
      }

      const defaultMethod = customer.invoice_settings.default_payment_method
      let card = null

      if (typeof defaultMethod === 'string') {
        const paymentMethod = await stripe.paymentMethods.retrieve(defaultMethod)
        card = paymentMethod.card
          ? {
              brand: paymentMethod.card.brand,
              last4: paymentMethod.card.last4,
              expMonth: paymentMethod.card.exp_month,
              expYear: paymentMethod.card.exp_year,
            }
          : null
      }

      return NextResponse.json({
        enabled: customer.metadata.autopay_enabled === 'true',
        preference: customer.metadata.autopay_preference || null,
        card,
      })
    }

    if (action === 'disable') {
      if (customer) {
        customer = await stripe.customers.update(customer.id, {
          metadata: {
            ...customer.metadata,
            autopay_enabled: 'false',
          },
        })
      }

      return NextResponse.json({ enabled: false })
    }

    if (action !== 'enroll' || !preferences.has(body.preference)) {
      return NextResponse.json(
        { error: 'Choose a valid AutoPay option.' },
        { status: 400 }
      )
    }

    const name = [context.camper.first_name, context.camper.last_name]
      .filter(Boolean)
      .join(' ')

    if (!customer) {
      customer = await stripe.customers.create({
        email,
        name: name || undefined,
        metadata: {
          supabase_user_id: context.user.id,
          camper_id: String(context.camper.id),
          autopay_enabled: 'false',
          autopay_preference: body.preference,
        },
      })
    } else {
      customer = await stripe.customers.update(customer.id, {
        email,
        name: name || undefined,
        metadata: {
          ...customer.metadata,
          supabase_user_id: context.user.id,
          camper_id: String(context.camper.id),
          autopay_preference: body.preference,
        },
      })
    }

    const origin = new URL(request.url).origin
    const session = await stripe.checkout.sessions.create({
      mode: 'setup',
      currency: 'usd',
      customer: customer.id,
      payment_method_types: ['card'],
      success_url: `${origin}/invoices?autopay=success`,
      cancel_url: `${origin}/invoices?autopay=cancelled`,
      metadata: {
        purpose: 'autopay_enrollment',
        autopay_preference: body.preference,
        camper_id: String(context.camper.id),
      },
      setup_intent_data: {
        metadata: {
          purpose: 'autopay_enrollment',
          autopay_preference: body.preference,
          camper_id: String(context.camper.id),
        },
      },
    })

    return NextResponse.json({ url: session.url })
  } catch (error: any) {
    console.error('AUTOPAY ERROR:', error)
    return NextResponse.json(
      { error: error.message || 'Unable to manage AutoPay.' },
      { status: 500 }
    )
  }
}
