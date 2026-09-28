import { thanksgivingDinnerDate } from './thanksgiving-dinner.ts'

type CommunityEvent = {
  id?: unknown
  event_date?: unknown
  title?: unknown
}

type EventRsvp = {
  event_id?: unknown
  response?: unknown
}

type DinnerSignup = {
  attending_status?: unknown
  guest_count?: unknown
}

export type CommunityEventCount = {
  rsvps: number
  going: number
  goingUnit: 'campsites' | 'people'
}

export function isThanksgivingCommunityEvent(event: CommunityEvent) {
  const title = String(event.title || '')
  return String(event.event_date || '') === thanksgivingDinnerDate
    && /thanksgiving|buroaksgiving/i.test(title)
}

export function communityEventCounts(
  events: CommunityEvent[],
  rsvps: EventRsvp[],
  thanksgivingSignups: DinnerSignup[],
) {
  const counts: Record<string, CommunityEventCount> = {}

  events.forEach((event) => {
    const eventId = String(event.id || '')
    if (!eventId) return
    const eventRsvps = rsvps.filter((rsvp) => String(rsvp.event_id || '') === eventId)
    counts[eventId] = {
      rsvps: eventRsvps.length,
      going: eventRsvps.filter((rsvp) => String(rsvp.response || '') === 'Going').length,
      goingUnit: 'campsites',
    }

    if (isThanksgivingCommunityEvent(event)) {
      counts[eventId] = {
        rsvps: thanksgivingSignups.length,
        going: thanksgivingSignups
          .filter((signup) => String(signup.attending_status || '') === 'Going')
          .reduce((total, signup) => total + Math.max(1, Number(signup.guest_count || 1)), 0),
        goingUnit: 'people',
      }
    }
  })

  return counts
}
