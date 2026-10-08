import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { effectivePortalRole } from './staff-roles.ts'
import {
  selectAuthenticatedCamperMatch,
  selectAuthenticatedEmailMatch,
  type AuthCamperRecord,
} from './auth-account-match.ts'

export { selectAuthenticatedCamperMatch, selectAuthenticatedEmailMatch } from './auth-account-match.ts'

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  'https://mzywctpxnpejglnspyqi.supabase.co'

async function findCamperForEmail(client: SupabaseClient, userEmail: string): Promise<AuthCamperRecord | null> {
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

  if (primaryMatch.error || secondaryMatch.error) return null

  // A person's own login email is authoritative. Secondary emails are used
  // only when that address is not the primary login on any active profile.
  // This prevents an authorized-contact copy on another camper from masking
  // Rachel's dedicated Event Coordinator profile.
  return selectAuthenticatedEmailMatch(
    (primaryMatch.data || []) as AuthCamperRecord[],
    (secondaryMatch.data || []) as AuthCamperRecord[],
  )
}

export async function getAuthenticatedContext(request: Request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!token || !anonKey || !serviceRoleKey) {
    return null
  }

  const authClient = createClient(supabaseUrl, anonKey)
  const { data, error } = await authClient.auth.getUser(token)

  if (error || !data.user?.email) {
    return null
  }

  const admin = createClient(supabaseUrl, serviceRoleKey)
  const userEmail = data.user.email.trim().toLowerCase()
  let camper = await findCamperForEmail(admin, userEmail)

  if (!camper) {
    const userScopedClient = createClient(supabaseUrl, anonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    })

    camper = await findCamperForEmail(userScopedClient, userEmail)
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
