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

    const { email: rawEmail, camperId } = await request.json()
    let email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : ''

    let camper = null

    if (typeof camperId === 'string' && camperId) {
      const { data } = await context.admin
        .from('campers')
        .select('id,email,active')
        .eq('id', camperId)
        .single()

      camper = data
      email = String(data?.email || '').trim().toLowerCase()
    }

    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      return NextResponse.json({ error: 'A valid email is required.' }, { status: 400 })
    }

    if (!camper) {
      const { data } = await context.admin
        .from('campers')
        .select('id,email,active')
        .ilike('email', email)
        .single()

      camper = data
    }

    if (!camper) {
      return NextResponse.json(
        { error: 'Save this camper with a real email before sending a portal invite.' },
        { status: 400 }
      )
    }

    if (camper.active === false) {
      return NextResponse.json(
        { error: 'This camper is archived. Restore the camper before sending a portal invite.' },
        { status: 400 }
      )
    }

    const origin = new URL(request.url).origin
    const { error } = await context.admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${origin}/set-password`,
    })

    if (error) {
      const canUseManualLink = /rate limit|already.*registered|already.*exists|user.*registered/i.test(error.message)

      if (!canUseManualLink) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      let linkResult = await context.admin.auth.admin.generateLink({
        type: 'recovery',
        email,
        options: { redirectTo: `${origin}/set-password` },
      })

      if (linkResult.error) {
        linkResult = await context.admin.auth.admin.generateLink({
          type: 'invite',
          email,
          options: { redirectTo: `${origin}/set-password` },
        })
      }

      const properties = linkResult.data?.properties
      const tokenHash = properties?.hashed_token
      const verificationType = properties?.verification_type
      const setupUrl = tokenHash && verificationType
        ? `${origin}/set-password?token_hash=${encodeURIComponent(tokenHash)}&type=${encodeURIComponent(verificationType)}`
        : ''

      if (linkResult.error || !setupUrl) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({
        success: true,
        delivery: 'manual',
        setupUrl,
      })
    }

    return NextResponse.json({ success: true, delivery: 'email' })
  } catch (error) {
    console.error('Unable to create camper account:', error)
    return NextResponse.json(
      { error: 'Unable to send the portal invitation.' },
      { status: 500 }
    )
  }
}
