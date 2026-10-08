import { NextResponse } from 'next/server'
import { getAuthenticatedContext } from '../../../lib/server-auth'

export async function POST(request: Request) {
  const context = await getAuthenticatedContext(request)
  if (!context || String(context.camper.role || '').toLowerCase() !== 'admin') return NextResponse.json({ error: 'Admin access is required.' }, { status: 401 })
  const body = await request.json().catch(() => ({}))
  const camperId = String(body.camperId || '').trim()
  const reason = String(body.reason || '').trim()
  if (!camperId || typeof body.active !== 'boolean' || reason.length < 5) return NextResponse.json({ error: 'Choose a camper and enter a clear status-change reason.' }, { status: 400 })
  const { data, error } = await context.admin.rpc('set_camper_active_audited', {
    p_camper_id: camperId, p_active: body.active, p_reason: reason.slice(0, 1000), p_actor_email: context.user.email || 'office',
  })
  if (error) return NextResponse.json({ error: ['42883', 'PGRST202'].includes(error.code || '') ? 'The protected camper audit update is not installed yet.' : error.message }, { status: 400 })
  return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } })
}
