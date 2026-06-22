import { createClient } from '@supabase/supabase-js'

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

export type UserRole = 'admin' | 'camper'

const DEFAULT_ROLE: UserRole = 'camper'

export async function getCurrentUserRole(): Promise<UserRole> {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user?.email) {
    return DEFAULT_ROLE
  }

  const userEmail = user.email.trim().toLowerCase()
  const { data: camper, error } = await supabase
    .from('campers')
    .select('role')
    .or(`email.ilike.${userEmail},secondary_email.ilike.${userEmail}`)
    .single()

  if (error || !camper || !(camper as any).role) {
    return DEFAULT_ROLE
  }

  const role = String((camper as any).role).toLowerCase()

  return role === 'admin'
    ? 'admin'
    : DEFAULT_ROLE
}

export async function isAdmin(): Promise<boolean> {
  return (await getCurrentUserRole()) === 'admin'
}

export async function isCamper(): Promise<boolean> {
  return (await getCurrentUserRole()) === 'camper'
}
