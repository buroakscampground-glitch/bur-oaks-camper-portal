import { NextResponse } from 'next/server'
import { getAuthenticatedContext } from '../../../lib/server-auth'
import { checkRateLimit } from '../../../lib/rate-limit'
import {
  portalInviteEmailConfigured,
  sendPortalInviteEmail,
} from '../../../lib/portal-invite-email'

async function generateSetupUrl(context: any, email: string, origin: string) {
  let linkResult = await context.admin.auth.admin.generateLink({
    type: 'invite',
    email,
    options: { redirectTo: `${origin}/set-password` },
  })

  if (linkResult.error) {
    linkResult = await context.admin.auth.admin.generateLink({
      type: 'recovery',
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
    throw new Error(linkResult.error?.message || 'Unable to create setup link.')
  }

  return setupUrl
}

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
        .select('id,first_name,last_name,email,secondary_email,active')
        .eq('id', camperId)
        .single()

      camper = data
      const primaryEmail = String(data?.email || '').trim().toLowerCase()
      const secondaryEmail = String(data?.secondary_email || '').trim().toLowerCase()
      email = email === secondaryEmail ? secondaryEmail : primaryEmail
    }

    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      return NextResponse.json({ error: 'A valid email is required.' }, { status: 400 })
    }

    if (!camper) {
      const { data } = await context.admin
        .from('campers')
        .select('id,first_name,last_name,email,secondary_email,active')
        .or(`email.ilike.${email},secondary_email.ilike.${email}`)
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

    if (portalInviteEmailConfigured()) {
      const setupUrl = await generateSetupUrl(context, email, origin)
      await sendPortalInviteEmail({
        to: email,
        camperName: `${camper.first_name || ''} ${camper.last_name || ''}`.trim() || 'Camper',
        setupUrl,
      })

      await context.admin.from('portal_invite_log').insert({
        camper_id: camper.id,
        email,
        delivery_status: 'sent',
        delivery_provider: 'resend',
        sent_by: context.user.email,
      })

      return NextResponse.json({ success: true, delivery: 'email-service' })
    }

    const { error } = await context.admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${origin}/set-password`,
    })

    if (error) {
      const canUseManualLink = /rate limit|already.*registered|already.*exists|user.*registered/i.test(error.message)

      if (!canUseManualLink) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      let setupUrl = ''
      try {
        setupUrl = await generateSetupUrl(context, email, origin)
      } catch {
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
