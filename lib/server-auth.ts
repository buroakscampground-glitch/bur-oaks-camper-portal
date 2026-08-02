import { createClient } from '@supabase/supabase-js'

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  'https://mzywctpxnpejglnspyqi.supabase.co'

async function findCamperForEmail(client: any, userEmail: string) {
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

  const camperMatches = [
    ...(primaryMatch.data || []),
    ...(secondaryMatch.data || []),
  ].filter((match, index, all) => all.findIndex((item) => item.id === match.id) === index)

  const activeMatches = camperMatches.filter((match) => match.active !== false)

  // Never choose an arbitrary account when duplicate identities exist.
  return activeMatches.length === 1 ? activeMatches[0] : null
}

function assuranceLevelFromToken(token: string) {
  try {
    const payload = token.split('.')[1]
    if (!payload) return 'aal1'
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    return decoded?.aal === 'aal2' ? 'aal2' : 'aal1'
  } catch {
    return 'aal1'
  }
}

export async function getAuthenticatedContext(
  request: Request,
  options: { allowPrivilegedAal1?: boolean } = {}
) {
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

  const assuranceLevel = assuranceLevelFromToken(token)
  const role = String(camper.role || 'camper').toLowerCase()

  if (
    !options.allowPrivilegedAal1 &&
    ['admin', 'maintenance'].includes(role) &&
    assuranceLevel !== 'aal2'
  ) {
    return null
  }

  return { user: data.user, camper, admin, assuranceLevel }
}
