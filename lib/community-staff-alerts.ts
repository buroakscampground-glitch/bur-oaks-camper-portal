import { canAdministerCommunity, effectivePortalRole } from './staff-roles.ts'

export type CommunityActivityKind = 'post' | 'comment' | 'like' | 'report' | 'moderation' | 'member_access'

export function communityStaffRecipients(campers: any[], actorId: unknown) {
  const seen = new Set<string>()
  return (campers || []).filter((camper) => {
    const id = String(camper?.id || '')
    if (!id || id === String(actorId || '') || camper?.active === false || seen.has(id)) return false
    if (!canAdministerCommunity(effectivePortalRole(camper))) return false
    seen.add(id)
    return true
  })
}

export function communityActivityMessage({
  kind,
  actorName,
  lotNumber,
  detail,
}: {
  kind: CommunityActivityKind
  actorName: string
  lotNumber?: unknown
  detail?: unknown
}) {
  const lot = String(lotNumber || '').trim()
  const actor = `${actorName || 'A camper'}${lot && !lot.startsWith('STAFF-') ? ` (Lot ${lot})` : ''}`
  const cleanDetail = String(detail || '').trim().replace(/\s+/g, ' ').slice(0, 140)
  if (kind === 'post') return `${actor} added a Community post${cleanDetail ? `: ${cleanDetail}` : '.'}`
  if (kind === 'comment') return `${actor} commented${cleanDetail ? `: ${cleanDetail}` : ' on a Community post.'}`
  if (kind === 'like') return `${actor} liked a Community post.`
  if (kind === 'report') return `${actor} reported Community content for review.`
  if (kind === 'member_access') return `${actor} changed a camper's Community access${cleanDetail ? `: ${cleanDetail}` : '.'}`
  return `${actor} moderated Community content${cleanDetail ? `: ${cleanDetail}` : '.'}`
}
