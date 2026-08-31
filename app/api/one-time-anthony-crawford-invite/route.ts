import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { sendPortalInviteEmail } from '../../../lib/portal-invite-email'
import { getSiteUrl } from '../../../lib/site-url'

const oneTimeKey = 'anthony-crawford-invite-74b8ce91'
const requestedEmail = 'crawford640@gmail.com'

async function setupUrl(admin: any) {
  const origin = getSiteUrl()
  let result = await admin.auth.admin.generateLink({
    type: 'invite',
    email: requestedEmail,
    options: { redirectTo: `${origin}/set-password` },
  })
  if (result.error) {
    result = await admin.auth.admin.generateLink({
      type: 'recovery',
      email: requestedEmail,
      options: { redirectTo: `${origin}/set-password` },
    })
  }
  const token = result.data?.properties?.hashed_token
  const type = result.data?.properties?.verification_type
  if (result.error || !token || !type) throw new Error(result.error?.message || 'Unable to create setup link.')
  return `${origin}/set-password?token_hash=${encodeURIComponent(token)}&type=${encodeURIComponent(type)}`
}

export async function POST(request: Request) {
  if (request.headers.get('x-one-time-key') !== oneTimeKey) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return NextResponse.json({ error: 'Database is not configured.' }, { status: 500 })
  const admin = createClient(url, key)

  const [{ data: matches, error: matchError }, { data: emailMatches, error: emailError }] = await Promise.all([
    admin.from('campers')
      .select('id,first_name,last_name,lot_number,email,secondary_email,active,role')
      .ilike('first_name', 'Anthony')
      .ilike('last_name', 'Crawford'),
    admin.from('campers')
      .select('id,first_name,last_name,lot_number,email,secondary_email,active')
      .or(`email.ilike.${requestedEmail},secondary_email.ilike.${requestedEmail}`),
  ])
  if (matchError || emailError) return NextResponse.json({ error: matchError?.message || emailError?.message }, { status: 500 })

  const activeMatches = (matches || []).filter((camper: any) => camper.active !== false && String(camper.role || '').toLowerCase() !== 'admin')
  if (activeMatches.length !== 1) {
    return NextResponse.json({
      error: activeMatches.length ? 'More than one active Anthony Crawford record was found.' : 'No active Anthony Crawford camper record was found.',
      candidateLots: activeMatches.map((camper: any) => camper.lot_number),
    }, { status: 409 })
  }

  const camper = activeMatches[0]
  const conflicting = (emailMatches || []).find((row: any) => row.id !== camper.id && row.active !== false)
  if (conflicting) {
    return NextResponse.json({ error: `That email is already assigned to another active camper at Lot ${conflicting.lot_number}.` }, { status: 409 })
  }

  const primary = String(camper.email || '').trim().toLowerCase()
  const secondary = String(camper.secondary_email || '').trim().toLowerCase()
  let field = primary === requestedEmail ? 'email' : secondary === requestedEmail ? 'secondary_email' : ''
  if (!field) {
    field = primary ? 'secondary_email' : 'email'
    if (field === 'secondary_email' && secondary) {
      return NextResponse.json({ error: 'Anthony Crawford already has both email positions filled. Nothing was overwritten.' }, { status: 409 })
    }
    const { error: updateError } = await admin.from('campers').update({ [field]: requestedEmail }).eq('id', camper.id)
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  const link = await setupUrl(admin)
  const delivery = await sendPortalInviteEmail({
    to: requestedEmail,
    camperName: `${camper.first_name || ''} ${camper.last_name || ''}`.trim(),
    setupUrl: link,
  })

  await admin.from('portal_invite_log').insert({
    camper_id: camper.id,
    email: requestedEmail,
    delivery_status: 'sent',
    delivery_provider: (delivery as any)?.provider || 'email-service',
    sent_by: 'Codex authorized admin request',
  })

  return NextResponse.json({
    success: true,
    camper: `${camper.first_name} ${camper.last_name}`,
    lot: camper.lot_number,
    email: requestedEmail,
    field,
    provider: (delivery as any)?.provider || 'email-service',
    providerMessageId: (delivery as any)?.id || null,
  })
}
