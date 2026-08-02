import { NextResponse } from 'next/server'
import { getAuthenticatedContext } from '../../../lib/server-auth'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const context = await getAuthenticatedContext(request)

  if (!context) {
    return NextResponse.json(
      { error: 'This login is not connected to one active portal account. Please contact the office.' },
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

  return NextResponse.json({ role, destination, camper_id: context.camper.id })
}
