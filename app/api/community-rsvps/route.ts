import { NextResponse } from 'next/server'
import { getAuthenticatedContext } from '../../../lib/server-auth'
import { canManageCommunity, isAdminRole } from '../../../lib/staff-roles'

export async function GET(request: Request) {
  const context = await getAuthenticatedContext(request)
  if (!context || !canManageCommunity(context.camper.role)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  const [eventResult, rsvpResult, camperResult] = await Promise.all([
    context.admin.from('events').select('id,title,event_date,description').order('event_date', { ascending: true }),
    context.admin.from('event_rsvps').select('id,event_id,camper_id,response'),
    context.admin.from('campers').select('id,lot_number,first_name,last_name').eq('active', true),
  ])
  if (eventResult.error || rsvpResult.error || camperResult.error) {
    return NextResponse.json({ error: eventResult.error?.message || rsvpResult.error?.message || camperResult.error?.message }, { status: 500 })
  }

  if (isAdminRole(context.camper.role)) {
    await context.admin
      .from('admin_notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('type', 'event_rsvp')
      .is('read_at', null)
  }

  return NextResponse.json({ events: eventResult.data || [], rsvps: rsvpResult.data || [], campers: camperResult.data || [] })
}
