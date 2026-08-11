import { NextResponse } from 'next/server'
import { eventFlyers2026 } from '../../../lib/event-flyers'
import { getAuthenticatedContext } from '../../../lib/server-auth'
import { checkRateLimit } from '../../../lib/rate-limit'

export const runtime = 'nodejs'

const allowedResponses = ['Going', 'Maybe', 'Not Going']

async function findOrCreateEvent(context: NonNullable<Awaited<ReturnType<typeof getAuthenticatedContext>>>, slug: string) {
  const flyer = eventFlyers2026.find((event) => event.slug === slug)

  if (!flyer) {
    return { flyer: null, event: null }
  }

  const { data: existingEvents } = await context.admin
    .from('events')
    .select('*')
    .eq('title', flyer.title)
    .eq('event_date', flyer.date)
    .limit(1)

  const existingEvent = existingEvents?.[0]

  if (existingEvent) {
    return { flyer, event: existingEvent }
  }

  const { data: createdEvent, error } = await context.admin
    .from('events')
    .insert({
      title: flyer.title,
      event_date: flyer.date,
      description: flyer.description,
    })
    .select('*')
    .single()

  if (error) {
    throw error
  }

  return { flyer, event: createdEvent }
}

async function getEventStatus(context: NonNullable<Awaited<ReturnType<typeof getAuthenticatedContext>>>, slug: string) {
  const { flyer, event } = await findOrCreateEvent(context, slug)

  if (!flyer || !event) {
    return null
  }

  const { data: rsvps } = await context.admin
    .from('event_rsvps')
    .select('*')
    .eq('event_id', event.id)

  const safeRsvps = rsvps || []
  const myRsvp = safeRsvps.find((rsvp) => rsvp.camper_id === context.camper.id)
  const goingCamperIds = Array.from(
    new Set(
      safeRsvps
        .filter((rsvp) => rsvp.response === 'Going' && rsvp.camper_id)
        .map((rsvp) => rsvp.camper_id)
    )
  )
  let goingCampers: Array<{ name: string; lotNumber: string | null }> = []

  if (goingCamperIds.length) {
    const { data: optedInCampers } = await context.admin
      .from('campers')
      .select('id,first_name,last_name,lot_number,directory_opt_in')
      .in('id', goingCamperIds)
      .eq('directory_opt_in', true)

    goingCampers = (optedInCampers || []).map((camper) => ({
      name: `${camper.first_name || ''} ${camper.last_name || ''}`.trim() || 'Camper',
      lotNumber: camper.lot_number || null,
    }))
  }

  return {
    eventId: event.id,
    myResponse: myRsvp?.response || null,
    goingCampers,
    counts: {
      going: safeRsvps.filter((rsvp) => rsvp.response === 'Going').length,
      maybe: safeRsvps.filter((rsvp) => rsvp.response === 'Maybe').length,
      notGoing: safeRsvps.filter((rsvp) => rsvp.response === 'Not Going').length,
    },
  }
}

export async function GET(request: Request) {
  const context = await getAuthenticatedContext(request)

  if (!context) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  const slug = new URL(request.url).searchParams.get('slug') || ''

  try {
    const status = await getEventStatus(context, slug)

    if (!status) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, ...status })
  } catch (error) {
    console.error('Event RSVP status failed:', error)
    return NextResponse.json({ error: 'Unable to load event response' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const rateLimit = await checkRateLimit(request, 'event-rsvp', 20, 10 * 60_000)
  if (!rateLimit.allowed) return NextResponse.json({ error: 'Too many RSVP changes. Please wait and try again.' }, { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfter) } })

  const context = await getAuthenticatedContext(request)

  if (!context) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const slug = String(body.slug || '')
  const response = String(body.response || '')

  if (!allowedResponses.includes(response)) {
    return NextResponse.json({ error: 'Invalid response' }, { status: 400 })
  }

  try {
    const { flyer, event } = await findOrCreateEvent(context, slug)

    if (!flyer || !event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    await context.admin
      .from('event_rsvps')
      .delete()
      .eq('event_id', event.id)
      .eq('camper_id', context.camper.id)

    const { error } = await context.admin
      .from('event_rsvps')
      .insert({
        event_id: event.id,
        camper_id: context.camper.id,
        response,
      })
      .select('*')
      .single()

    if (error) {
      throw error
    }

    const status = await getEventStatus(context, slug)

    return NextResponse.json({ success: true, ...status })
  } catch (error) {
    console.error('Event RSVP save failed:', error)
    return NextResponse.json({ error: 'Unable to save event response' }, { status: 500 })
  }
}
