import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkRateLimit } from '../../../lib/rate-limit'

export const runtime = 'nodejs'

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  'https://mzywctpxnpejglnspyqi.supabase.co'

function cleanEmail(value: unknown) {
  return String(value || '').trim().toLowerCase()
}

export async function POST(request: Request) {
  const contentType = request.headers.get('content-type') || ''
  const isFormSubmission = contentType.includes('application/x-www-form-urlencoded') ||
    contentType.includes('multipart/form-data')
  const errorResponse = (error: string, status: number, code = 'invalid') => {
    if (isFormSubmission) {
      return NextResponse.redirect(new URL(`/set-password?error=${encodeURIComponent(code)}`, request.url), 303)
    }
    return NextResponse.json({ error }, { status })
  }

  const rateLimit = await checkRateLimit(request, 'complete-portal-setup', 20, 60 * 60_000)
  if (!rateLimit.allowed) {
    return errorResponse('Too many setup attempts. Please wait before trying again.', 429, 'too-many')
  }

  let body: Record<string, unknown> = {}
  if (isFormSubmission) {
    const formData = await request.formData().catch(() => null)
    if (formData) body = Object.fromEntries(formData.entries())
  } else {
    body = await request.json().catch(() => ({}))
  }
  const tokenHash = String(body.tokenHash || '').trim()
  const verificationType = body.type === 'invite' || body.type === 'recovery'
    ? body.type
    : ''
  const password = String(body.password || '')
  const confirmation = String(body.confirmation || '')

  if (!tokenHash || !verificationType) {
    return errorResponse('This setup link is invalid or expired.', 400)
  }

  if (password.length < 10 || password.length > 128) {
    return errorResponse('Use a password between 10 and 128 characters.', 400, 'password-invalid')
  }

  if (isFormSubmission && password !== confirmation) {
    return errorResponse('The passwords do not match.', 400, 'password-mismatch')
  }

  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!anonKey || !serviceRoleKey) {
    return errorResponse('Portal setup is temporarily unavailable.', 503, 'temporary')
  }

  const verifier = createClient(supabaseUrl, anonKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  })

  const verification = await verifier.auth.verifyOtp({
    token_hash: tokenHash,
    type: verificationType,
  })

  const verifiedUser = verification.data.user
  const verifiedEmail = cleanEmail(verifiedUser?.email)
  if (verification.error || !verifiedUser?.id || !verifiedEmail) {
    return errorResponse(
      'This setup link is invalid or expired. Please ask the Bur Oaks office for a fresh link.',
      400,
    )
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  })

  const [primaryMatch, secondaryMatch] = await Promise.all([
    admin.from('campers').select('id,active').ilike('email', verifiedEmail).limit(10),
    admin.from('campers').select('id,active').ilike('secondary_email', verifiedEmail).limit(10),
  ])

  const camperMatches = [
    ...(primaryMatch.data || []),
    ...(secondaryMatch.data || []),
  ].filter((match, index, all) =>
    match.active !== false && all.findIndex((item) => item.id === match.id) === index
  )

  if (primaryMatch.error || secondaryMatch.error || camperMatches.length !== 1) {
    return errorResponse(
      'This email is not connected to one active camper account. Please contact the Bur Oaks office.',
      400,
    )
  }

  const { error: updateError } = await admin.auth.admin.updateUserById(verifiedUser.id, {
    password,
    user_metadata: {
      ...(verifiedUser.user_metadata || {}),
      portal_setup_complete: true,
    },
  })

  if (updateError) {
    return errorResponse('The password could not be saved. Please request a fresh setup link.', 500)
  }

  const verifiedAccessToken = verification.data.session?.access_token
  if (verifiedAccessToken) {
    const { error: signOutError } = await admin.auth.admin.signOut(verifiedAccessToken, 'global')
    if (signOutError) console.error('Unable to revoke setup sessions:', signOutError)
  }

  if (isFormSubmission) {
    return NextResponse.redirect(new URL('/login?passwordUpdated=1', request.url), 303)
  }
  return NextResponse.json({ success: true })
}
