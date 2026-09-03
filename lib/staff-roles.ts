export const EVENT_COORDINATOR_ROLE = 'event_coordinator'

export function normalizedPortalRole(role: unknown) {
  return String(role || 'camper').trim().toLowerCase()
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

export function portalDestinationForRole(role: unknown) {
  const normalized = normalizedPortalRole(role)
  if (normalized === 'admin') return '/admin'
  if (normalized === EVENT_COORDINATOR_ROLE) return '/community'
  if (normalized === 'maintenance') return '/maintenance/dashboard'
  if (normalized === 'camper') return '/portal'
  return ''
}
