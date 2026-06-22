import { NextResponse } from 'next/server'
import { getAuthenticatedContext } from '../../../lib/server-auth'
import { checkRateLimit } from '../../../lib/rate-limit'

export async function POST(request: Request) {
  const rateLimit = checkRateLimit(request, 'camper-invite', 10, 10 * 60_000)
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many invitation attempts. Please wait before trying again.' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfter) } }
    )
  }

  try {
    const context = await getAuthenticatedContext(request)

    if (!context || String(context.camper.role).toLowerCase() !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { email: rawEmail } = await request.json()
    const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : ''

    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      return NextResponse.json({ error: 'A valid email is required.' }, { status: 400 })
    }

    const { data: camper } = await context.admin
      .from('campers')
      .select('id,email,active')
      .ilike('email', email)
      .single()

    if (!camper) {
      return NextResponse.json(
        { error: 'Create the camper record before sending a portal invite.' },
        { status: 400 }
      )
    }

    const origin = new URL(request.url).origin
    const { error } = await context.admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${origin}/set-password`,
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Unable to create camper account:', error)
    return NextResponse.json(
      { error: 'Unable to send the portal invitation.' },
      { status: 500 }
    )
  }
}
