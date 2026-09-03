const SYSTEM_PORTAL_LOTS = new Set(['1001', '1002', '1003'])

export function isSystemPortalAccount(camper: { lot_number?: unknown }) {
  return SYSTEM_PORTAL_LOTS.has(String(camper.lot_number || '').trim().toUpperCase())
}

export function isOperationalCamper(camper: { lot_number?: unknown; role?: unknown }) {
  const role = String(camper.role || 'camper').trim().toLowerCase()
  return !isSystemPortalAccount(camper) && !['admin', 'maintenance', 'event_coordinator'].includes(role)
}
