export type CommunityAccessLevel = 'active' | 'read_only' | 'blocked'

export function normalizeCommunityAccess(value: unknown): CommunityAccessLevel {
  if (value === 'read_only' || value === 'blocked') return value
  return 'active'
}

export function canViewCommunity(value: unknown) {
  return normalizeCommunityAccess(value) !== 'blocked'
}

export function canParticipateInCommunity(value: unknown) {
  return normalizeCommunityAccess(value) === 'active'
}

export function communityAccessLabel(value: unknown) {
  const access = normalizeCommunityAccess(value)
  if (access === 'blocked') return 'Community access blocked'
  if (access === 'read_only') return 'Read-only'
  return 'Active'
}
