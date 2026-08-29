import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getSiteUrl } from '../../../lib/site-url'
import { sendPortalInviteEmail } from '../../../lib/portal-invite-email'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ONE_TIME_KEY = '9e5cf871702620ea2298adbcb624120dbbd5a310ba35d470'
const SECONDARY_EMAIL = 'tmdcknsn71@gmail.com'
const MARKER = 'one-time-dusti-secondary-2026-08-29'

function authorized(request: Request) {
  return request.headers.get('x-one-time-key') === ONE_TIME_KEY
}

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  return url && key ? createClient(url, key) : null
}

async function findDusti(admin: any) {
  const [{ data: primary, error: primaryError }, { data: secondary, error: secondaryError }] = await Promise.all([
    admin
      .from('campers')
      .select('id,first_name,last_name,second_profile_first_name,second_profile_last_name,lot_number,email,secondary_email,active,role')
      .ilike('first_name', 'Dusti')
      .ilike('last_name', 'Stearns'),
    admin
      .from('campers')
      .select('id,first_name,last_name,second_profile_first_name,second_profile_last_name,lot_number,email,secondary_email,active,role')
      .ilike('second_profile_first_name', 'Dusti')
      .ilike('second_profile_last_name', 'Stearns'),
  ])

  if (primaryError || secondaryError) throw new Error(primaryError?.message || secondaryError?.message)

  return [...(primary || []), ...(secondary || [])]
    .filter((row, index, all) => all.findIndex((candidate) => candidate.id === row.id) === index)
    .filter((row) => row.active !== false && String(row.role || '').toLowerCase() !== 'admin')
}

async function generateSetupUrl(admin: any) {
  const origin = getSiteUrl()
  let result = await admin.auth.admin.generateLink({
    type: 'invite',
    email: SECONDARY_EMAIL,
    options: { redirectTo: `${origin}/set-password` },
  })

  if (result.error) {
    result = await admin.auth.admin.generateLink({
      type: 'recovery',
      email: SECONDARY_EMAIL,
      options: { redirectTo: `${origin}/set-password` },
    })
  }

  const tokenHash = result.data?.properties?.hashed_token
  const verificationType = result.data?.properties?.verification_type
  if (result.error || !tokenHash || !verificationType) {
    throw new Error(result.error?.message || 'Unable to create the portal setup link.')
  }

  return `${origin}/set-password?token_hash=${encodeURIComponent(tokenHash)}&type=${encodeURIComponent(verificationType)}`
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  const admin = adminClient()
  if (!admin) return NextResponse.json({ error: 'Production database is not configured.' }, { status: 500 })

  try {
    const matches = await findDusti(admin)
    return NextResponse.json({ matches })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Unable to inspect the camper record.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  const admin = adminClient()
  if (!admin) return NextResponse.json({ error: 'Production database is not configured.' }, { status: 500 })

  try {
    const matches = await findDusti(admin)
    if (matches.length !== 1) {
      return NextResponse.json({ error: `Expected one active Dusti Stearns camper record; found ${matches.length}.`, matches }, { status: 409 })
    }

    const camper = matches[0]
    const currentSecondary = String(camper.secondary_email || '').trim().toLowerCase()
    if (currentSecondary && currentSecondary !== SECONDARY_EMAIL) {
      return NextResponse.json({
        error: 'Dusti Stearns already has a different second-profile email. No change was made.',
        camper,
      }, { status: 409 })
    }

    const [{ data: primaryOwner }, { data: secondaryOwner }] = await Promise.all([
      admin.from('campers').select('id,lot_number,active').ilike('email', SECONDARY_EMAIL),
      admin.from('campers').select('id,lot_number,active').ilike('secondary_email', SECONDARY_EMAIL),
    ])
    const conflictingOwner = [...(primaryOwner || []), ...(secondaryOwner || [])]
      .find((row) => row.active !== false && row.id !== camper.id)
    if (conflictingOwner) {
      return NextResponse.json({
        error: `That email is already attached to active Lot ${conflictingOwner.lot_number || 'unknown'}. No change was made.`,
      }, { status: 409 })
    }

    const { data: alreadySent } = await admin
      .from('portal_invite_log')
      .select('id')
      .eq('sent_by', MARKER)
      .eq('delivery_status', 'sent')
      .limit(1)

    if (currentSecondary !== SECONDARY_EMAIL) {
      const { error: updateError } = await admin
        .from('campers')
        .update({ secondary_email: SECONDARY_EMAIL })
        .eq('id', camper.id)
      if (updateError) throw new Error(updateError.message)
    }

    if (alreadySent?.length) {
      return NextResponse.json({ success: true, alreadySent: true, lotNumber: camper.lot_number, email: SECONDARY_EMAIL })
    }

    const setupUrl = await generateSetupUrl(admin)
    const providerResult = await sendPortalInviteEmail({
      to: SECONDARY_EMAIL,
      camperName: `${camper.first_name || ''} ${camper.last_name || ''}`.trim() || 'Camper',
      setupUrl,
    })

    await admin.from('portal_invite_log').insert({
      camper_id: camper.id,
      email: SECONDARY_EMAIL,
      delivery_status: 'sent',
      delivery_provider: (providerResult as any)?.provider || 'email-service',
      sent_by: MARKER,
    })

    return NextResponse.json({
      success: true,
      alreadySent: false,
      lotNumber: camper.lot_number,
      email: SECONDARY_EMAIL,
      provider: (providerResult as any)?.provider || 'email-service',
    })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Unable to update the profile and send the setup link.' }, { status: 500 })
  }
}
