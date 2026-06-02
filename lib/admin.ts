import { supabase } from './supabase'

export async function requireAdminUser() {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user?.email) {
    return null
  }

  const { data: camper } = await supabase
    .from('campers')
    .select('role')
    .eq('email', user.email)
    .single()

  if (!camper) {
    return null
  }

  return camper
}