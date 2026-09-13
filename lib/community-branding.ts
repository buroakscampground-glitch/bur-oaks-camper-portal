export const OFFICIAL_COMMUNITY_NAME = 'Bur Oaks Campground'
export const EVENT_COORDINATOR_PUBLIC_NAME = 'Rachel F'

type CommunityActor = {
  first_name?: unknown
  last_name?: unknown
  second_profile_first_name?: unknown
  second_profile_last_name?: unknown
  email?: unknown
  secondary_email?: unknown
  role?: unknown
  lot_number?: unknown
}

function normalizedEmail(value: unknown) {
  return String(value || '').trim().toLowerCase()
}

export function communityActorAuthor(actor: CommunityActor, signedInEmail?: unknown) {
  const firstName = String(actor.first_name || '').trim()
  const lastName = String(actor.last_name || '').trim()
  const isEventCoordinator =
    String(actor.role || '').trim().toLowerCase() === 'event_coordinator' ||
    String(actor.lot_number || '').trim().toUpperCase() === 'STAFF-EVENTS'
  if (isEventCoordinator) {
    return EVENT_COORDINATOR_PUBLIC_NAME
  }

  const loginEmail = normalizedEmail(signedInEmail)
  const primaryEmail = normalizedEmail(actor.email)
  const secondaryEmail = normalizedEmail(actor.secondary_email)
  if (loginEmail && secondaryEmail && loginEmail !== primaryEmail && loginEmail === secondaryEmail) {
    const secondaryFirstName = String(actor.second_profile_first_name || '').trim()
    const secondaryLastName = String(actor.second_profile_last_name || '').trim()
    const secondaryName = [secondaryFirstName, secondaryLastName].filter(Boolean).join(' ')
    if (secondaryName) return secondaryName
  }

  return [firstName, lastName].filter(Boolean).join(' ') || 'Bur Oaks Camper'
}

export function communityVisibleAuthorName(value: unknown) {
  const name = String(value || '').trim()
  if (/^rachel\s+event\s+coordinator$/i.test(name)) return EVENT_COORDINATOR_PUBLIC_NAME
  return name || 'Camper'
}

export function communityVisibleText(value: unknown) {
  return String(value || '').replace(/Rachel\s+Event\s+Coordinator/gi, EVENT_COORDINATOR_PUBLIC_NAME)
}

export function communityPostAuthor(post: { is_official?: unknown; author_name?: unknown }) {
  return post.is_official === true ? OFFICIAL_COMMUNITY_NAME : communityVisibleAuthorName(post.author_name)
}

export function communityPostLocation(post: { is_official?: unknown; lot_number?: unknown }) {
  if (post.is_official === true) return 'Posted by the Bur Oaks office'
  return post.lot_number ? `Lot ${String(post.lot_number)}` : ''
}
