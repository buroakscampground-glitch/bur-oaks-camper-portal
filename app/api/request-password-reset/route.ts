import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkRateLimit } from '../../../lib/rate-limit'
import { getSiteUrl } from '../../../lib/site-url'
import {
  portalInviteEmailConfigured,
  sendPortalInviteEmail,
} from '../../../lib/portal-invite-email'

export const runtime = 'nodejs'

const genericSuccess = () => NextResponse.json({ success: true })

export async function POST(request: Request) {
  const rateLimit = await checkRateLimit(request, 'password-reset-request', 5, 15 * 60_000)
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many reset attempts. Please wait a few minutes and try again.' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfter) } },
    )
  }

  try {
    const body = await request.json().catch(() => ({}))
    const email = String(body?.email || '').trim().toLowerCase()
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceRoleKey || !portalInviteEmailConfigured()) {
      return NextResponse.json({ error: 'Password reset email is temporarily unavailable.' }, { status: 503 })
    }

    const admin = createClient(supabaseUrl, serviceRoleKey)
    const { data: matches } = await admin
      .from('campers')
      .select('id,first_name,last_name,email,secondary_email,active')
      .or(`email.ilike.${email},secondary_email.ilike.${email}`)
      .eq('active', true)
      .limit(2)

    // Keep the response identical for unknown or ambiguous addresses.
    if (!matches || matches.length !== 1) return genericSuccess()

    const { data, error } = await admin.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo: `${getSiteUrl()}/set-password` },
    })

    const tokenHash = data?.properties?.hashed_token
    const verificationType = data?.properties?.verification_type
    if (error || !tokenHash || !verificationType) {
      console.error('Unable to generate password reset link:', error)
      return genericSuccess()
    }

    const setupUrl = `${getSiteUrl()}/set-password?token_hash=${encodeURIComponent(tokenHash)}&type=${encodeURIComponent(verificationType)}`
    await sendPortalInviteEmail({
      to: email,
      camperName: `${matches[0].first_name || ''} ${matches[0].last_name || ''}`.trim() || 'Camper',
      setupUrl,
    })

    return genericSuccess()
  } catch (error) {
    console.error('Password reset request failed:', error)
    // Do not reveal whether an account exists for the submitted address.
    return genericSuccess()
  }
}
