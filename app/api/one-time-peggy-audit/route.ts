import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

const ONE_TIME_KEY = 'd2223f7759d949820d9d750a32b00d8870af99f5ea5eb24a'
const PEGGY_EMAIL = 'peggybartz@sbcglobal.net'

function cleanEmail(value: unknown) {
  return String(value || '').trim().toLowerCase()
}

export async function GET(request: Request) {
  if (request.headers.get('x-one-time-key') !== ONE_TIME_KEY) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return NextResponse.json({ error: 'Production database is not configured.' }, { status: 500 })

  const admin = createClient(url, serviceKey)
  const [{ data: primaryRows, error: primaryError }, { data: secondaryRows, error: secondaryError }, { data: inviteRows, error: inviteError }, usersResult] = await Promise.all([
    admin
      .from('campers')
      .select('id,lot_number,first_name,last_name,email,secondary_email,active,role')
      .ilike('email', PEGGY_EMAIL),
    admin
      .from('campers')
      .select('id,lot_number,first_name,last_name,email,secondary_email,active,role')
      .ilike('secondary_email', PEGGY_EMAIL),
    admin
      .from('portal_invite_log')
      .select('email,delivery_status,delivery_provider,error_message,created_at')
      .ilike('email', PEGGY_EMAIL)
      .order('created_at', { ascending: false })
      .limit(10),
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ])

  if (primaryError || secondaryError || inviteError || usersResult.error) {
    return NextResponse.json({ error: primaryError?.message || secondaryError?.message || inviteError?.message || usersResult.error?.message || 'Audit failed.' }, { status: 500 })
  }

  const camperRows = [...(primaryRows || []), ...(secondaryRows || [])]
    .filter((row, index, all) => all.findIndex((item) => item.id === row.id) === index)
  const authUsers = (usersResult.data?.users || []).filter((user) => cleanEmail(user.email) === PEGGY_EMAIL)

  return NextResponse.json({
    emailChecked: PEGGY_EMAIL,
    camperRecords: camperRows.map((row) => ({
      lotNumber: row.lot_number,
      camperName: `${row.first_name || ''} ${row.last_name || ''}`.trim(),
      primaryEmailMatches: cleanEmail(row.email) === PEGGY_EMAIL,
      secondaryEmailMatches: cleanEmail(row.secondary_email) === PEGGY_EMAIL,
      active: row.active !== false,
      role: row.role,
    })),
    loginAccounts: authUsers.map((user) => ({
      email: cleanEmail(user.email),
      emailConfirmedAt: user.email_confirmed_at || null,
      lastSignInAt: user.last_sign_in_at || null,
      setupComplete: user.user_metadata?.portal_setup_complete === true,
      createdAt: user.created_at || null,
      updatedAt: user.updated_at || null,
      bannedUntil: user.banned_until || null,
      providers: (user.identities || []).map((identity) => identity.provider),
    })),
    recentInvites: (inviteRows || []).map((row) => ({
      status: row.delivery_status,
      provider: row.delivery_provider,
      error: row.error_message,
      createdAt: row.created_at,
    })),
  })
}
