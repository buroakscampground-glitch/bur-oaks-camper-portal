import { NextResponse } from 'next/server'
import { GET as getBirthdayOffice } from '../admin-birthdays/route'
import { centralDate } from '../../../lib/camper-celebrations'
import { nextSaturdayDinner } from '../../../lib/saturday-dinners'
import { getAuthenticatedContext } from '../../../lib/server-auth'
import { canManageCommunity } from '../../../lib/staff-roles'

export const dynamic = 'force-dynamic'

const trackedSections = ['announcements', 'events', 'dinners', 'rsvps'] as const
type TrackedSection = (typeof trackedSections)[number]
type SeenItems = Record<TrackedSection, string[]>

const emptySeen = (): SeenItems => ({ announcements: [], events: [], dinners: [], rsvps: [] })

function normalizeSeen(value: unknown): SeenItems {
  const seen = emptySeen()
  if (!value || typeof value !== 'object') return seen
  for (const section of trackedSections) {
    const items = (value as Record<string, unknown>)[section]
    if (Array.isArray(items)) seen[section] = items.filter((item): item is string => typeof item === 'string').slice(-500)
  }
  return seen
}

async function loadTrackableItems(context: NonNullable<Awaited<ReturnType<typeof getAuthenticatedContext>>>, today: string) {
  const dinner = nextSaturdayDinner(new Date(`${today}T12:00:00`))
  const [announcements, upcomingEvents, dinnerResponses] = await Promise.all([
    context.admin.from('announcements').select('id').eq('is_active', true),
    context.admin.from('events').select('id').gte('event_date', today),
    dinner
      ? context.admin.from('saturday_dinner_signups').select('id, updated_at').eq('dinner_date', dinner.date).neq('attending_status', 'Not Going')
      : Promise.resolve({ data: [], error: null }),
  ])
  const queryError = announcements.error || upcomingEvents.error || dinnerResponses.error
  if (queryError) throw queryError

  const eventIds = (upcomingEvents.data || []).map((event: { id: string | number }) => String(event.id))
  const rsvps = eventIds.length
    ? await context.admin.from('event_rsvps').select('id').in('event_id', eventIds)
    : { data: [], error: null }
  if (rsvps.error) throw rsvps.error

  return {
    dinnerDate: dinner?.date || null,
    items: {
      announcements: (announcements.data || []).map((item: { id: string | number }) => String(item.id)),
      events: eventIds,
      dinners: (dinnerResponses.data || []).map((item: { id: string | number; updated_at?: string | null }) => `${item.id}:${item.updated_at || ''}`),
      rsvps: (rsvps.data || []).map((item: { id: string | number }) => String(item.id)),
    } satisfies SeenItems,
  }
}

export async function GET(request: Request) {
  const context = await getAuthenticatedContext(request)
  if (!context || !canManageCommunity(context.camper.role)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  try {
    const today = centralDate().iso
    const [birthdays, trackable, communityActivity] = await Promise.all([
      getBirthdayOffice(request).then(async (response) => {
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'Unable to load birthdays.')
        return result
      }),
      loadTrackableItems(context, today),
      context.admin.from('community_notifications').select('id', { count: 'exact', head: true }).eq('camper_id', context.camper.id).is('read_at', null),
    ])
    if (communityActivity.error) throw communityActivity.error

    const seen = normalizeSeen(context.user.user_metadata?.community_workspace_seen)
    const unseen = (section: TrackedSection) => trackable.items[section].filter((id) => !seen[section].includes(id)).length
    const counts = {
      feed: Number(communityActivity.count || 0),
      birthdays: Number(birthdays.counts.needsGreeting || 0),
      announcements: unseen('announcements'),
      events: unseen('events'),
      dinners: unseen('dinners'),
      rsvps: unseen('rsvps'),
    }

    return NextResponse.json({ counts, total: Object.values(counts).reduce((sum, count) => sum + count, 0), dinnerDate: trackable.dinnerDate })
  } catch (error) {
    console.error('Community workspace summary failed:', error)
    return NextResponse.json({ error: 'Unable to load Community badges.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const context = await getAuthenticatedContext(request)
  if (!context || !canManageCommunity(context.camper.role)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const section = typeof body.section === 'string' ? body.section : ''
    if (!trackedSections.includes(section as TrackedSection)) {
      return NextResponse.json({ error: 'Unknown Community section.' }, { status: 400 })
    }

    const typedSection = section as TrackedSection
    const trackable = await loadTrackableItems(context, centralDate().iso)
    const seen = normalizeSeen(context.user.user_metadata?.community_workspace_seen)
    seen[typedSection] = trackable.items[typedSection].slice(-500)

    const { error } = await context.admin.auth.admin.updateUserById(context.user.id, {
      user_metadata: { ...(context.user.user_metadata || {}), community_workspace_seen: seen },
    })
    if (error) throw error
    return NextResponse.json({ success: true, section: typedSection })
  } catch (error) {
    console.error('Community badge clear failed:', error)
    return NextResponse.json({ error: 'Unable to clear this Community badge.' }, { status: 500 })
  }
}
