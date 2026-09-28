import { createClient } from '@supabase/supabase-js'
import { effectivePortalRole } from './staff-roles'

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  'https://mzywctpxnpejglnspyqi.supabase.co'

export function selectAuthenticatedCamperMatch(matches: any[] = []) {
  const uniqueActiveMatches = matches
    .filter((match) => match?.active !== false)
    .filter((match, index, all) => all.findIndex((item) => item?.id === match?.id) === index)

  if (uniqueActiveMatches.length === 1) return uniqueActiveMatches[0]

  // An email can legitimately appear on both a camper profile and a staff
  // profile. In that case, select the one unambiguous staff identity. Never
  // guess between multiple ordinary camper profiles or multiple staff roles.
  const staffMatches = uniqueActiveMatches.filter((match) =>
    ['admin', 'event_coordinator', 'maintenance'].includes(effectivePortalRole(match))
  )

  return staffMatches.length === 1 ? staffMatches[0] : null
}

export function selectAuthenticatedEmailMatch(primaryMatches: any[] = [], secondaryMatches: any[] = []) {
  const activePrimaryMatches = primaryMatches.filter((match) => match?.active !== false)
  if (activePrimaryMatches.length) {
    return selectAuthenticatedCamperMatch(activePrimaryMatches)
  }

  return selectAuthenticatedCamperMatch(secondaryMatches)
}

async function findCamperForEmail(client: any, userEmail: string, lookupSource: 'service' | 'user') {
  const [primaryMatch, secondaryMatch] = await Promise.all([
    client
      .from('campers')
      .select('*')
      .ilike('email', userEmail)
      .limit(10),
    client
      .from('campers')
      .select('*')
      .ilike('secondary_email', userEmail)
      .limit(10),
  ])

  // A person's own login email is authoritative. Secondary emails are used
  // only when that address is not the primary login on any active profile.
  // This prevents an authorized-contact copy on another camper from masking
  // Rachel's dedicated Event Coordinator profile.
  const selected = selectAuthenticatedEmailMatch(primaryMatch.data || [], secondaryMatch.data || [])
  if (!selected) {
    const summarize = (matches: any[] = []) => matches
      .filter((match) => match?.active !== false)
      .map((match) => effectivePortalRole(match))
      .sort()
    console.warn('[server-auth] Portal profile lookup did not resolve', {
      lookupSource,
      primaryRoles: summarize(primaryMatch.data || []),
      secondaryRoles: summarize(secondaryMatch.data || []),
      primaryError: primaryMatch.error?.code || '',
      secondaryError: secondaryMatch.error?.code || '',
    })
  }
  return selected
}

export async function getAuthenticatedContext(request: Request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!token || !anonKey || !serviceRoleKey) {
    console.warn('[server-auth] Authentication prerequisites missing', {
      hasToken: Boolean(token),
      hasAnonKey: Boolean(anonKey),
      hasServiceRoleKey: Boolean(serviceRoleKey),
    })
    return null
  }

  const authClient = createClient(supabaseUrl, anonKey)
  const { data, error } = await authClient.auth.getUser(token)

  if (error || !data.user?.email) {
    console.warn('[server-auth] Supabase session validation failed', { code: error?.code || '', hasEmail: Boolean(data.user?.email) })
    return null
  }

  const admin = createClient(supabaseUrl, serviceRoleKey)
  const userEmail = data.user.email.trim().toLowerCase()
  let camper = await findCamperForEmail(admin, userEmail, 'service')

  if (!camper) {
    const userScopedClient = createClient(supabaseUrl, anonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    })

    camper = await findCamperForEmail(userScopedClient, userEmail, 'user')
  }

  if (!camper || camper.active === false) {
    return null
  }

  return {
    user: data.user,
    camper: { ...camper, role: effectivePortalRole(camper) },
    admin,
  }
}
