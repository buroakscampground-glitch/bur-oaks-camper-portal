import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getAuthenticatedContext } from '../../../lib/server-auth'
import { loadMoneyExceptionQueue } from '../../../lib/money-exceptions-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const context = await getAuthenticatedContext(request)
  if (!context || String(context.camper.role || '').toLowerCase() !== 'admin') {
    return NextResponse.json({ error: 'Admin access is required.' }, { status: 401 })
  }

  try {
    if (!process.env.STRIPE_SECRET_KEY) throw new Error('Stripe is not configured for the money exception check.')
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
    const now = new Date().toISOString()
    const exceptions = await loadMoneyExceptionQueue({ admin: context.admin, stripe })
    return NextResponse.json({
      checkedAt: now,
      counts: {
        total: exceptions.length,
        urgent: exceptions.filter((item) => item.severity === 'urgent').length,
        watch: exceptions.filter((item) => item.severity === 'watch').length,
      },
      exceptions,
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to verify money exceptions.' }, { status: 500 })
  }
}
