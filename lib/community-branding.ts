export const OFFICIAL_COMMUNITY_NAME = 'Bur Oaks Campground'

export function communityPostAuthor(post: { is_official?: unknown; author_name?: unknown }) {
  return post.is_official === true ? OFFICIAL_COMMUNITY_NAME : String(post.author_name || 'Camper')
}

export function communityPostLocation(post: { is_official?: unknown; lot_number?: unknown }) {
  if (post.is_official === true) return 'Posted by the Bur Oaks office'
  return post.lot_number ? `Lot ${String(post.lot_number)}` : ''
}
