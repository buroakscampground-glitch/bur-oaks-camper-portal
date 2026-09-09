export const OFFICIAL_COMMUNITY_NAME = 'Bur Oaks Campground'

export function communityActorAuthor(actor: { first_name?: unknown; last_name?: unknown; role?: unknown }) {
  const firstName = String(actor.first_name || '').trim()
  const lastName = String(actor.last_name || '').trim()
  if (String(actor.role || '').trim().toLowerCase() === 'event_coordinator') {
    return [firstName, lastName.slice(0, 1)].filter(Boolean).join(' ') || 'Community Coordinator'
  }
  return [firstName, lastName].filter(Boolean).join(' ') || 'Bur Oaks Camper'
}

export function communityPostAuthor(post: { is_official?: unknown; author_name?: unknown }) {
  return post.is_official === true ? OFFICIAL_COMMUNITY_NAME : String(post.author_name || 'Camper')
}

export function communityPostLocation(post: { is_official?: unknown; lot_number?: unknown }) {
  if (post.is_official === true) return 'Posted by the Bur Oaks office'
  return post.lot_number ? `Lot ${String(post.lot_number)}` : ''
}
