import { NextResponse } from 'next/server'
import { getAuthenticatedContext } from '../../../lib/server-auth'
import { canManageCommunity } from '../../../lib/staff-roles'

export async function GET(request: Request) {
  const context = await getAuthenticatedContext(request)
  if (!context || !canManageCommunity(context.camper.role)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }
  const { data, error } = await context.admin
    .from('saturday_dinner_signups')
    .select('*')
    .order('dinner_date', { ascending: true })
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ signups: data || [] })
}
