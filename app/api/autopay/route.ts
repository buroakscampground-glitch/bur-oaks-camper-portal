import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getAuthenticatedContext } from '../../../lib/server-auth'
import { checkRateLimit } from '../../../lib/rate-limit'
import { getSiteUrl } from '../../../lib/site-url'

export const runtime = 'nodejs'

const preferences = new Set(['electric', 'rent', 'both'])
const paymentMethods = new Set(['card', 'ach'])

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
  userId: string,
  camperId: string
) {
  const customers = await stripe.customers.list({ email, limit: 10 })
  const exactMatches = customers.data.filter((customer) =>
    customer.metadata.supabase_user_id === userId ||
    customer.metadata.camper_id === camperId
  )

  if (exactMatches.length > 1) {
    throw new Error('Multiple AutoPay profiles were found for this camper. Please contact the office before changing AutoPay.')
  }

  return exactMatches[0] || null
}

export async function POST(request: Request) {
  const rateLimit = await checkRateLimit(request, 'autopay', 20, 60_000)
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
    let customer = await findCustomer(stripe, email, context.user.id, String(context.camper.id))

    if (action === 'status') {
      if (!customer) {
        return NextResponse.json({ enabled: false })
      }

      const defaultMethod = customer.invoice_settings.default_payment_method
      let card = null
      let bank = null
      let methodType: 'card' | 'ach' | null = null
      let methodLabel = null

      if (typeof defaultMethod === 'string') {
        const paymentMethod = await stripe.paymentMethods.retrieve(defaultMethod)
        methodType = paymentMethod.type === 'us_bank_account' ? 'ach' : paymentMethod.type === 'card' ? 'card' : null
        methodLabel = methodType === 'ach' ? 'ACH bank account' : methodType === 'card' ? 'Card' : null
        card = paymentMethod.card
          ? {
              brand: paymentMethod.card.brand,
              last4: paymentMethod.card.last4,
              expMonth: paymentMethod.card.exp_month,
              expYear: paymentMethod.card.exp_year,
            }
          : null
        bank = paymentMethod.us_bank_account
          ? {
              bankName: paymentMethod.us_bank_account.bank_name,
              last4: paymentMethod.us_bank_account.last4,
              accountType: paymentMethod.us_bank_account.account_type,
            }
          : null
      }

      return NextResponse.json({
        enabled: customer.metadata.autopay_enabled === 'true',
        preference: customer.metadata.autopay_preference || null,
        paymentMethod: customer.metadata.autopay_payment_method || methodType,
        methodLabel,
        card,
        bank,
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

    const autopayPaymentMethod = paymentMethods.has(body.paymentMethod)
      ? body.paymentMethod
      : 'card'
    const stripePaymentMethodTypes = autopayPaymentMethod === 'ach'
      ? ['us_bank_account' as const]
      : ['card' as const]

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
          autopay_payment_method: autopayPaymentMethod,
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
          autopay_payment_method: autopayPaymentMethod,
        },
      })
    }

    const origin = getSiteUrl()
    const session = await stripe.checkout.sessions.create({
      mode: 'setup',
      currency: 'usd',
      customer: customer.id,
      payment_method_types: stripePaymentMethodTypes,
      success_url: `${origin}/invoices?autopay=success`,
      cancel_url: `${origin}/invoices?autopay=cancelled`,
      metadata: {
        purpose: 'autopay_enrollment',
        autopay_preference: body.preference,
        autopay_payment_method: autopayPaymentMethod,
        camper_id: String(context.camper.id),
      },
      setup_intent_data: {
        metadata: {
          purpose: 'autopay_enrollment',
          autopay_preference: body.preference,
          autopay_payment_method: autopayPaymentMethod,
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
