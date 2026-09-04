import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getSiteUrl } from '../../../lib/site-url'
import { sendPortalInviteEmail } from '../../../lib/portal-invite-email'

export const runtime = 'nodejs'

const ONE_TIME_KEY = '83d7ca1d5a1041d58c989f2601130387'
const MARKER = 'one-time-phillip-quinn-reset-2026-09-04'

function maskEmail(email: string) {
  const [name, domain] = email.split('@')
  if (!name || !domain) return 'configured address'
  return `${name.slice(0, 2)}***@${domain}`
}

export async function POST(request: Request) {
  if (request.headers.get('x-one-time-key') !== ONE_TIME_KEY) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    return NextResponse.json({ error: 'Production database is not configured.' }, { status: 500 })
  }

  const admin = createClient(url, serviceKey)
  const { data: alreadySent } = await admin
    .from('portal_invite_log')
    .select('id,email,delivery_provider')
    .eq('sent_by', MARKER)
    .eq('delivery_status', 'sent')
    .limit(1)

  if (alreadySent?.length) {
    return NextResponse.json({
      success: true,
      alreadySent: true,
      email: maskEmail(String(alreadySent[0].email || '')),
      provider: alreadySent[0].delivery_provider,
    })
  }

  const { data: matches, error: lookupError } = await admin
    .from('campers')
    .select('id,lot_number,first_name,last_name,email,active')
    .ilike('lot_number', 'FF17')
    .ilike('last_name', 'Quinn')
    .eq('active', true)

  if (lookupError) {
    return NextResponse.json({ error: lookupError.message }, { status: 500 })
  }
  if (!matches || matches.length !== 1) {
    return NextResponse.json({ error: `Expected one active Quinn record at FF17; found ${matches?.length || 0}.` }, { status: 409 })
  }

  const camper = matches[0]
  const email = String(camper.email || '').trim().toLowerCase()
  if (!/^\S+@\S+\.\S+$/.test(email) || email.endsWith('@no-email.buroaks.local')) {
    return NextResponse.json({ error: 'Phillip Quinn does not have a valid primary email on file.' }, { status: 409 })
  }

  const result = await admin.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo: `${getSiteUrl()}/set-password` },
  })
  const tokenHash = result.data?.properties?.hashed_token
  const verificationType = result.data?.properties?.verification_type
  if (result.error || !tokenHash || !verificationType) {
    return NextResponse.json({ error: result.error?.message || 'Unable to create the reset link.' }, { status: 500 })
  }

  const setupUrl = `${getSiteUrl()}/set-password?token_hash=${encodeURIComponent(tokenHash)}&type=${encodeURIComponent(verificationType)}`
  try {
    const delivery = await sendPortalInviteEmail({
      to: email,
      camperName: `${camper.first_name || 'Phillip'} ${camper.last_name || 'Quinn'}`.trim(),
      setupUrl,
      purpose: 'password_reset',
    })
    const provider = delivery.provider || 'email'
    await admin.from('portal_invite_log').insert({
      camper_id: camper.id,
      email,
      delivery_status: 'sent',
      delivery_provider: `password-reset-${provider}`,
      sent_by: MARKER,
    })

    return NextResponse.json({ success: true, alreadySent: false, email: maskEmail(email), provider })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Unable to send the reset email.' }, { status: 500 })
  }
}
