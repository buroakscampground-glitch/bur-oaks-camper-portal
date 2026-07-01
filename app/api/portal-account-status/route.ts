import { NextResponse } from 'next/server'
import { getAuthenticatedContext } from '../../../lib/server-auth'

export async function GET(request: Request) {
  const context = await getAuthenticatedContext(request)

  if (!context || String(context.camper.role).toLowerCase() !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await context.admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  })

  if (error) {
    return NextResponse.json({ error: 'Unable to load portal statuses.' }, { status: 500 })
  }

  const statuses: Record<string, 'pending' | 'accepted'> = {}

  for (const user of data.users) {
    if (!user.email) continue

    const email = user.email.trim().toLowerCase()
    const completedSetup = user.user_metadata?.portal_setup_complete === true
    const establishedUser = Boolean(user.email_confirmed_at || user.last_sign_in_at)

    statuses[email] = completedSetup || establishedUser
      ? 'accepted'
      : 'pending'
  }

  return NextResponse.json({ statuses })
}
