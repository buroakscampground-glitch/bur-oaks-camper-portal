import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthenticatedContext } from '../../../lib/server-auth'

export const runtime = 'nodejs'

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  'https://mzywctpxnpejglnspyqi.supabase.co'

export async function GET(request: Request) {
  const context = await getAuthenticatedContext(request)

  if (!context) {
    const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    let userEmail = ''

    if (token && anonKey) {
      const authClient = createClient(supabaseUrl, anonKey)
      const { data } = await authClient.auth.getUser(token)
      userEmail = data.user?.email || ''
    }

    return NextResponse.json(
      {
        error: 'This login is not connected to an active camper record.',
        email: userEmail,
      },
      { status: 404 }
    )
  }

  const role = String(context.camper.role || 'camper').toLowerCase()
  const destination =
    role === 'admin'
      ? '/admin'
      : role === 'maintenance'
        ? '/maintenance/dashboard'
        : role === 'camper'
          ? '/portal'
          : ''

  if (!destination) {
    return NextResponse.json(
      { error: 'This account has an unsupported portal role.' },
      { status: 400 }
    )
  }

  return NextResponse.json({
    role,
    destination,
    camper_id: context.camper.id,
  })
}
