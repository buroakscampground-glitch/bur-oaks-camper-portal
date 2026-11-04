type SiteServiceEntryDetails = {
  reportedBy: string
  reason: string
  confirmedSite: string
  expectedSite?: string | null
}

export function normalizeSiteNumber(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^(lot|site)\s*/i, '')
    .replace(/[\s-]+/g, '')
}

export function validateSiteServiceEntry({
  reportedBy,
  reason,
  confirmedSite,
  expectedSite,
}: SiteServiceEntryDetails) {
  if (!reportedBy.trim()) return 'Enter the name of the person reporting or requesting this work.'
  if (!reason.trim()) return 'Explain why this work was performed or requested.'
  if (!expectedSite?.trim()) return 'This camper does not have a site number. Confirm the camper record before adding a charge.'
  if (!confirmedSite.trim()) return `Type site ${expectedSite} to confirm the correct camper account.`
  if (normalizeSiteNumber(confirmedSite) !== normalizeSiteNumber(expectedSite)) {
    return `Site confirmation does not match Lot ${expectedSite}. No charge was added.`
  }
  return ''
}

export function buildSiteServiceHistory({
  reportedBy,
  reason,
  expectedSite,
}: Pick<SiteServiceEntryDetails, 'reportedBy' | 'reason' | 'expectedSite'>) {
  return [
    `Reported by: ${reportedBy.trim()}`,
    `Reason: ${reason.trim()}`,
    `Confirmed site: ${expectedSite?.trim() || 'Not recorded'}`,
  ].join('\n')
}
