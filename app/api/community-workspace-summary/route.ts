import { NextResponse } from 'next/server'
import { GET as getBirthdayOffice } from '../admin-birthdays/route'
import { centralDate } from '../../../lib/camper-celebrations'
import { nextSaturdayDinner } from '../../../lib/saturday-dinners'
import { getAuthenticatedContext } from '../../../lib/server-auth'
import { canManageCommunity } from '../../../lib/staff-roles'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const context = await getAuthenticatedContext(request)
  if (!context || !canManageCommunity(context.camper.role)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  try {
    const today = centralDate().iso
    const dinner = nextSaturdayDinner(new Date(`${today}T12:00:00`))

    const [birthdays, announcements, upcomingEvents, dinnerResponses, communityActivity] = await Promise.all([
      getBirthdayOffice(request).then(async (response) => {
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'Unable to load birthdays.')
        return result
      }),
      context.admin
        .from('announcements')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true),
      context.admin
        .from('events')
        .select('id')
        .gte('event_date', today),
      dinner
        ? context.admin
          .from('saturday_dinner_signups')
          .select('id', { count: 'exact', head: true })
          .eq('dinner_date', dinner.date)
          .neq('attending_status', 'Not Going')
        : Promise.resolve({ count: 0, error: null }),
      context.admin
        .from('community_notifications')
        .select('id', { count: 'exact', head: true })
        .eq('camper_id', context.camper.id)
        .is('read_at', null),
    ])

    const queryError = announcements.error || upcomingEvents.error || dinnerResponses.error || communityActivity.error
    if (queryError) throw queryError

    const upcomingEventIds = (upcomingEvents.data || []).map((event: any) => String(event.id))
    const rsvpResponses = upcomingEventIds.length
      ? await context.admin
        .from('event_rsvps')
        .select('id', { count: 'exact', head: true })
        .in('event_id', upcomingEventIds)
      : { count: 0, error: null }

    if (rsvpResponses.error) throw rsvpResponses.error

    const counts = {
      feed: Number(communityActivity.count || 0),
      birthdays: Number(birthdays.counts.needsGreeting || 0),
      announcements: Number(announcements.count || 0),
      events: upcomingEventIds.length,
      dinners: Number(dinnerResponses.count || 0),
      rsvps: Number(rsvpResponses.count || 0),
    }

    return NextResponse.json({
      counts,
      total: Object.values(counts).reduce((sum, count) => sum + count, 0),
      dinnerDate: dinner?.date || null,
    })
  } catch (error) {
    console.error('Community workspace summary failed:', error)
    return NextResponse.json({ error: 'Unable to load Community badges.' }, { status: 500 })
  }
}
