import { isThanksgivingCommunityEvent } from './community-event-counts.ts'

type CommunityEvent = {
  id?: unknown
  event_date?: unknown
  title?: unknown
}

type EventRsvp = {
  id?: unknown
  event_id?: unknown
  camper_id?: unknown
  response?: unknown
}

type DinnerSignup = {
  id?: unknown
  camper_id?: unknown
  attending_status?: unknown
  guest_count?: unknown
  bringing?: unknown
  lot_number?: unknown
  camper_name?: unknown
}

export type UnifiedCommunityRsvp = {
  id: string
  event_id: string
  camper_id: string
  response: string
  guest_count: number
  bringing: string
  lot_number: string
  camper_name: string
  source: 'event' | 'thanksgiving'
}

export function unifiedCommunityRsvps(
  events: CommunityEvent[],
  eventRsvps: EventRsvp[],
  thanksgivingSignups: DinnerSignup[],
) {
  const thanksgivingEventIds = new Set(
    events.filter(isThanksgivingCommunityEvent).map((event) => String(event.id || '')).filter(Boolean)
  )
  const signupCamperIds = new Set(
    thanksgivingSignups.map((signup) => String(signup.camper_id || '')).filter(Boolean)
  )

  const regularRsvps: UnifiedCommunityRsvp[] = eventRsvps
    .filter((rsvp) => !thanksgivingEventIds.has(String(rsvp.event_id || '')))
    .map((rsvp) => ({
      id: String(rsvp.id || ''),
      event_id: String(rsvp.event_id || ''),
      camper_id: String(rsvp.camper_id || ''),
      response: String(rsvp.response || ''),
      guest_count: 1,
      bringing: '',
      lot_number: '',
      camper_name: '',
      source: 'event' as const,
    }))

  const thanksgivingRsvps: UnifiedCommunityRsvp[] = Array.from(thanksgivingEventIds).flatMap((eventId) =>
    thanksgivingSignups.map((signup) => ({
      id: `thanksgiving-${String(signup.id || '')}`,
      event_id: eventId,
      camper_id: String(signup.camper_id || ''),
      response: String(signup.attending_status || ''),
      guest_count: Math.max(1, Number(signup.guest_count || 1)),
      bringing: String(signup.bringing || ''),
      lot_number: String(signup.lot_number || ''),
      camper_name: String(signup.camper_name || ''),
      source: 'thanksgiving' as const,
    }))
  )

  const incompleteThanksgivingRsvps = eventRsvps
    .filter((rsvp) => thanksgivingEventIds.has(String(rsvp.event_id || '')))
    .filter((rsvp) => !signupCamperIds.has(String(rsvp.camper_id || '')))
    .map((rsvp) => ({
      id: String(rsvp.id || ''),
      event_id: String(rsvp.event_id || ''),
      camper_id: String(rsvp.camper_id || ''),
      response: String(rsvp.response || ''),
    }))

  return {
    rsvps: [...regularRsvps, ...thanksgivingRsvps],
    incompleteThanksgivingRsvps,
  }
}
