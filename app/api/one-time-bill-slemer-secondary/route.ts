import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getSiteUrl } from '../../../lib/site-url'
import { sendPortalInviteEmail } from '../../../lib/portal-invite-email'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ONE_TIME_KEY = 'b7bd8e7efb73dedb8dfaa3ce8a436a6e66fd71f5187ca893'
const SECONDARY_EMAIL = 'billslemer@yahoo.com'
const MARKER = 'one-time-bill-slemer-secondary-2026-08-30'

function authorized(request: Request) {
  return request.headers.get('x-one-time-key') === ONE_TIME_KEY
}

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  return url && key ? createClient(url, key) : null
}

async function findBillSlemer(admin: any) {
  const { data, error } = await admin
    .from('campers')
    .select('id,first_name,last_name,second_profile_first_name,second_profile_last_name,lot_number,email,secondary_email,active,role')
    .or('last_name.ilike.Slemer,second_profile_last_name.ilike.Slemer')

  if (error) throw new Error(error.message)

  const activeCampers = (data || []).filter(
    (row: any) => row.active !== false && String(row.role || '').toLowerCase() !== 'admin'
  )
  const billMatches = activeCampers.filter((row: any) => {
    const firstNames = [row.first_name, row.second_profile_first_name]
      .map((value) => String(value || '').trim().toLowerCase())
    return firstNames.includes('bill') || firstNames.includes('william')
  })

  return billMatches.length ? billMatches : activeCampers
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
    return NextResponse.json({ matches: await findBillSlemer(admin) })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Unable to inspect the camper record.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  const admin = adminClient()
  if (!admin) return NextResponse.json({ error: 'Production database is not configured.' }, { status: 500 })

  try {
    const matches = await findBillSlemer(admin)
    if (matches.length !== 1) {
      return NextResponse.json({
        error: `Expected one active Bill Slemer camper record; found ${matches.length}. No change was made.`,
        matches,
      }, { status: 409 })
    }

    const camper = matches[0]
    const currentSecondary = String(camper.secondary_email || '').trim().toLowerCase()
    if (currentSecondary && currentSecondary !== SECONDARY_EMAIL) {
      return NextResponse.json({
        error: 'Bill Slemer already has a different second-profile email. No change was made.',
        camper,
      }, { status: 409 })
    }

    const [{ data: primaryOwners }, { data: secondaryOwners }] = await Promise.all([
      admin.from('campers').select('id,lot_number,active').ilike('email', SECONDARY_EMAIL),
      admin.from('campers').select('id,lot_number,active').ilike('secondary_email', SECONDARY_EMAIL),
    ])
    const conflictingOwner = [...(primaryOwners || []), ...(secondaryOwners || [])]
      .find((row: any) => row.active !== false && row.id !== camper.id)
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
      return NextResponse.json({
        success: true,
        alreadySent: true,
        lotNumber: camper.lot_number,
        email: SECONDARY_EMAIL,
      })
    }

    const setupUrl = await generateSetupUrl(admin)
    const providerResult = await sendPortalInviteEmail({
      to: SECONDARY_EMAIL,
      camperName: `${camper.first_name || ''} ${camper.last_name || ''}`.trim() || 'Camper',
      setupUrl,
    })

    const { error: logError } = await admin.from('portal_invite_log').insert({
      camper_id: camper.id,
      email: SECONDARY_EMAIL,
      delivery_status: 'sent',
      delivery_provider: (providerResult as any)?.provider || 'email-service',
      sent_by: MARKER,
    })
    if (logError) throw new Error(logError.message)

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
