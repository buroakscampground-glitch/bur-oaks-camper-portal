export const OFFICIAL_COMMUNITY_NAME = 'Bur Oaks Campground'
export const EVENT_COORDINATOR_PUBLIC_NAME = 'Rachel F'

export function communityActorAuthor(actor: { first_name?: unknown; last_name?: unknown; role?: unknown; lot_number?: unknown }) {
  const firstName = String(actor.first_name || '').trim()
  const lastName = String(actor.last_name || '').trim()
  const isEventCoordinator =
    String(actor.role || '').trim().toLowerCase() === 'event_coordinator' ||
    String(actor.lot_number || '').trim().toUpperCase() === 'STAFF-EVENTS'
  if (isEventCoordinator) {
    return EVENT_COORDINATOR_PUBLIC_NAME
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
