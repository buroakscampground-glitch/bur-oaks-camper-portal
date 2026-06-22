import { createClient } from '@supabase/supabase-js'

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  'https://mzywctpxnpejglnspyqi.supabase.co'

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
  const { data: camper } = await admin
    .from('campers')
    .select('*')
    .ilike('email', data.user.email)
    .single()

  if (!camper || camper.active === false) {
    return null
  }

  return { user: data.user, camper, admin }
}
