export const communityActions = {
  events: { label: 'View events and RSVP', href: '/calendar', adminHref: '/admin/events' },
  dinners: { label: 'View dinner details', href: '/dinners', adminHref: '/admin/dinners' },
  contact: { label: 'Contact the office', href: '/messages', adminHref: '/admin/messages' },
} as const

export type CommunityActionType = keyof typeof communityActions | 'custom'

export function normalizeCommunityActionType(value: unknown): CommunityActionType | null {
  const actionType = String(value || '').trim()
  return actionType === 'events' || actionType === 'dinners' || actionType === 'contact' || actionType === 'custom'
    ? actionType
    : null
}

export function safeCommunityActionUrl(value: unknown) {
  const raw = String(value || '').trim().slice(0, 500)
  if (!raw || /[\u0000-\u001f\u007f]/.test(raw)) return null
  if (raw.startsWith('/') && !raw.startsWith('//') && !raw.includes('\\')) return raw

  try {
    const parsed = new URL(raw)
    return parsed.protocol === 'https:' ? parsed.toString() : null
  } catch {
    return null
  }
}

export function communityActionHref(actionType: unknown, storedUrl?: unknown, surface: 'camper' | 'admin' = 'camper') {
  const normalized = normalizeCommunityActionType(actionType)
  if (!normalized) return null
  if (normalized === 'custom') return safeCommunityActionUrl(storedUrl)

  // Resolve known destinations centrally instead of trusting an old saved URL.
  // Existing event buttons that used /events now open the camper RSVP calendar.
  return surface === 'admin'
    ? communityActions[normalized].adminHref
    : communityActions[normalized].href
}

export function communityActionLabel(actionType: unknown) {
  const normalized = normalizeCommunityActionType(actionType)
  if (!normalized || normalized === 'custom') return 'Open details'
  return communityActions[normalized].label
}
