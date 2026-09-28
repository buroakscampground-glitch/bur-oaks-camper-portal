import { NextResponse } from 'next/server'
import { checkRateLimit } from '../../../lib/rate-limit'
import { getAuthenticatedContext } from '../../../lib/server-auth'
import { canManageCommunity } from '../../../lib/staff-roles'
import { sendStaffWebPush } from '../../../lib/staff-web-push'
import { communityEventCounts } from '../../../lib/community-event-counts'
import { thanksgivingDinnerDate } from '../../../lib/thanksgiving-dinner'

async function authorized(request: Request) {
  const context = await getAuthenticatedContext(request)
  return context && canManageCommunity(context.camper.role) ? context : null
}

export async function GET(request: Request) {
  const context = await authorized(request)
  if (!context) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })

  const [
    { data: events, error: eventError },
    { data: rsvps, error: rsvpError },
    { data: thanksgivingSignups, error: thanksgivingError },
  ] = await Promise.all([
    context.admin.from('events').select('*').order('event_date', { ascending: true }),
    context.admin.from('event_rsvps').select('event_id,response'),
    context.admin
      .from('saturday_dinner_signups')
      .select('attending_status,guest_count')
      .eq('dinner_date', thanksgivingDinnerDate),
  ])
  if (eventError || rsvpError || thanksgivingError) {
    return NextResponse.json({ error: eventError?.message || rsvpError?.message || thanksgivingError?.message }, { status: 500 })
  }
  const eventList = events || []
  return NextResponse.json({
    events: eventList,
    rsvps: rsvps || [],
    eventCounts: communityEventCounts(eventList, rsvps || [], thanksgivingSignups || []),
  })
}

export async function POST(request: Request) {
  const limit = await checkRateLimit(request, 'community-events', 30, 10 * 60_000)
  if (!limit.allowed) return NextResponse.json({ error: 'Too many event changes. Please wait and try again.' }, { status: 429 })
  const context = await authorized(request)
  if (!context) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  const body = await request.json().catch(() => ({}))
  const title = String(body.title || '').trim().slice(0, 160)
  const eventDate = String(body.eventDate || '').trim()
  const description = String(body.description || '').trim().slice(0, 4000)
  if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) return NextResponse.json({ error: 'Add an event title and valid date.' }, { status: 400 })
  const { error } = await context.admin.from('events').insert({ title, event_date: eventDate, description })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await sendStaffWebPush(context.admin, {
    title: 'Community calendar updated',
    body: `${title} was added for ${eventDate}.`,
    urlByRole: { admin: '/admin/events', event_coordinator: '/community/events' },
    tag: 'community-event',
    excludeCamperId: String(context.camper.id),
  }).catch((pushError) => console.error('Event app alert failed:', pushError))
  return NextResponse.json({ success: true })
}

export async function DELETE(request: Request) {
  const context = await authorized(request)
  if (!context) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  const body = await request.json().catch(() => ({}))
  const id = String(body.id || '')
  if (!id) return NextResponse.json({ error: 'Choose an event.' }, { status: 400 })
  const { error } = await context.admin.from('events').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
