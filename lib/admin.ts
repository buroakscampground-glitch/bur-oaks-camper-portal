import { supabase } from './supabase'

export async function requireAdminUser() {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user?.email) {
    return null
  }

  const userEmail = user.email.trim().toLowerCase()
  const { data: camper } = await supabase
    .from('campers')
    .select('role,email')
    .or(`email.ilike.${userEmail},secondary_email.ilike.${userEmail}`)
    .single()

  if (!camper) {
    return null
  }

  return camper
}
