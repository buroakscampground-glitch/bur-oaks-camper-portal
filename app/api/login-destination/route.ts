import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthenticatedContext } from '../../../lib/server-auth'

export const runtime = 'nodejs'

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  'https://mzywctpxnpejglnspyqi.supabase.co'

export async function GET(request: Request) {
  const context = await getAuthenticatedContext(request)

  if (!context) {
    const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    let userEmail = ''
    let camperMatchCount = 0
    let camperSummary = ''

    if (token && anonKey) {
      const authClient = createClient(supabaseUrl, anonKey)
      const { data } = await authClient.auth.getUser(token)
      userEmail = data.user?.email?.trim().toLowerCase() || ''
    }

    if (userEmail && serviceRoleKey) {
      const admin = createClient(supabaseUrl, serviceRoleKey)
      const [primaryMatch, secondaryMatch] = await Promise.all([
        admin
          .from('campers')
          .select('id,lot_number,email,secondary_email,role,active')
          .ilike('email', userEmail)
          .limit(10),
        admin
          .from('campers')
          .select('id,lot_number,email,secondary_email,role,active')
          .ilike('secondary_email', userEmail)
          .limit(10),
      ])
      const camperMatches = [
        ...(primaryMatch.data || []),
        ...(secondaryMatch.data || []),
      ].filter((match, index, all) => all.findIndex((item) => item.id === match.id) === index)

      camperMatchCount = camperMatches.length
      camperSummary = camperMatches
        .map((camper) => `lot ${camper.lot_number || 'n/a'} role ${camper.role || 'blank'} active ${String(camper.active)}`)
        .join('; ')

      const camper =
        camperMatches.find((match) => match.active !== false && match.role) ||
        camperMatches.find((match) => match.active !== false)
      const role = String(camper?.role || 'camper').toLowerCase()
      const destination =
        role === 'admin'
          ? '/admin'
          : role === 'maintenance'
            ? '/maintenance/dashboard'
            : role === 'camper'
              ? '/portal'
              : ''

      if (camper && camper.active !== false && destination) {
        return NextResponse.json({
          role,
          destination,
          camper_id: camper.id,
          fallbackResolved: true,
        })
      }
    }

    return NextResponse.json(
      {
        error: serviceRoleKey
          ? 'This login is not connected to an active camper record.'
          : 'Server is missing SUPABASE_SERVICE_ROLE_KEY.',
        email: userEmail,
        serviceRoleConfigured: Boolean(serviceRoleKey),
        camperMatchCount,
        camperSummary,
      },
      { status: 404 }
    )
  }

  const role = String(context.camper.role || 'camper').toLowerCase()
  const destination =
    role === 'admin'
      ? '/admin'
      : role === 'maintenance'
        ? '/maintenance/dashboard'
        : role === 'camper'
          ? '/portal'
          : ''

  if (!destination) {
    return NextResponse.json(
      { error: 'This account has an unsupported portal role.' },
      { status: 400 }
    )
  }

  return NextResponse.json({
    role,
    destination,
    camper_id: context.camper.id,
  })
}
