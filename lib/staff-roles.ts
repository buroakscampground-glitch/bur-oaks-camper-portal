export const EVENT_COORDINATOR_ROLE = 'event_coordinator'
export const EVENT_COORDINATOR_LOT = 'STAFF-EVENTS'
export const MAINTENANCE_STAFF_LOT = 'STAFF'

export function normalizedPortalRole(role: unknown) {
  return String(role || 'camper').trim().toLowerCase()
}

// The STAFF-EVENTS marker keeps the limited coordinator account safe on
// databases whose older role constraint has not yet been upgraded. Its stored
// role remains "camper" (so it receives no maintenance/admin RLS privileges),
// while the application grants only the community tools.
export function effectivePortalRole(record: { role?: unknown; lot_number?: unknown }) {
  const lot = String(record?.lot_number || '').trim().toUpperCase()
  if (lot === EVENT_COORDINATOR_LOT) {
    return EVENT_COORDINATOR_ROLE
  }
  const role = normalizedPortalRole(record?.role)

  // Maintenance access belongs only to the dedicated STAFF identity. A
  // campsite profile must never become a staff account because of an
  // accidental role selection or legacy import.
  if (role === 'maintenance' && lot !== MAINTENANCE_STAFF_LOT) return 'camper'

  return role
}

export function isAdminRole(role: unknown) {
  return normalizedPortalRole(role) === 'admin'
}

export function isEventCoordinatorRole(role: unknown) {
  return normalizedPortalRole(role) === EVENT_COORDINATOR_ROLE
}

export function canManageCommunity(role: unknown) {
  const normalized = normalizedPortalRole(role)
  return normalized === 'admin' || normalized === EVENT_COORDINATOR_ROLE
}

export function canAdministerCommunity(role: unknown) {
  return canManageCommunity(role)
}

export function canPublishOfficialCommunityPosts(role: unknown) {
  return isAdminRole(role)
}

export function portalDestinationForRole(role: unknown) {
  const normalized = normalizedPortalRole(role)
  if (normalized === 'admin') return '/admin'
  if (normalized === EVENT_COORDINATOR_ROLE) return '/community'
  if (normalized === 'maintenance') return '/maintenance/dashboard'
  if (normalized === 'camper') return '/portal'
  return ''
}
