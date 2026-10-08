import { createClient } from '@supabase/supabase-js'
import { effectivePortalRole } from './staff-roles'
import { selectAuthenticatedEmailMatch, type AuthCamperRecord } from './auth-account-match'

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  'https://mzywctpxnpejglnspyqi.supabase.co'

const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'sb_publishable_ksynp497bY8X4MJ-NlRtgg_qYnwMAGv'

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey
)

export type UserRole = 'admin' | 'event_coordinator' | 'maintenance' | 'camper'

const DEFAULT_ROLE: UserRole = 'camper'

async function findCurrentCamperMatch(userEmail: string): Promise<AuthCamperRecord | null> {
  const [primaryMatch, secondaryMatch] = await Promise.all([
    supabase.from('campers').select('*').ilike('email', userEmail).limit(10),
    supabase.from('campers').select('*').ilike('secondary_email', userEmail).limit(10),
  ])
  if (primaryMatch.error || secondaryMatch.error) return null
  return selectAuthenticatedEmailMatch(
    (primaryMatch.data || []) as AuthCamperRecord[],
    (secondaryMatch.data || []) as AuthCamperRecord[],
  )
}

export async function getCurrentCamper() {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user?.email) return null

  const userEmail = user.email.trim().toLowerCase()
  const camper = await findCurrentCamperMatch(userEmail)
  return camper ? { ...camper, role: effectivePortalRole(camper) } : null
}

export async function getCurrentUserRole(): Promise<UserRole> {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user?.email) {
    return DEFAULT_ROLE
  }

  const userEmail = user.email.trim().toLowerCase()
  const camper = await findCurrentCamperMatch(userEmail)

  if (!camper || !camper.role) {
    return DEFAULT_ROLE
  }

  const role = effectivePortalRole(camper)

  return ['admin', 'event_coordinator', 'maintenance'].includes(role)
    ? role as UserRole
    : DEFAULT_ROLE
}

export async function isAdmin(): Promise<boolean> {
  return (await getCurrentUserRole()) === 'admin'
}

export async function isCamper(): Promise<boolean> {
  return (await getCurrentUserRole()) === 'camper'
}
