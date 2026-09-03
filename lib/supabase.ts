import { createClient } from '@supabase/supabase-js'
import { effectivePortalRole } from './staff-roles'

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

function pickBestCamperMatch(matches: any[] = []) {
  return (
    matches.find((match) => match.active !== false && match.role) ||
    matches.find((match) => match.active !== false) ||
    matches[0] ||
    null
  )
}

export async function getCurrentCamper() {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user?.email) return null

  const userEmail = user.email.trim().toLowerCase()
  const { data: camperMatches } = await supabase
    .from('campers')
    .select('*')
    .or(`email.ilike.${userEmail},secondary_email.ilike.${userEmail}`)
    .limit(10)

  const camper = pickBestCamperMatch(camperMatches || [])
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
  const { data: camperMatches, error } = await supabase
    .from('campers')
    .select('role,lot_number')
    .or(`email.ilike.${userEmail},secondary_email.ilike.${userEmail}`)
    .limit(10)

  const camper = pickBestCamperMatch(camperMatches || [])

  if (error || !camper || !(camper as any).role) {
    return DEFAULT_ROLE
  }

  const role = effectivePortalRole(camper as any)

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
