type AdminNotificationLinkInput = {
  type?: string | null
  camper_id?: string | null
}

export const resolutionRequiredAdminNotificationTypes = [
  'renewal_review',
  'nonrenewal_letter_review',
  'renewal_declined',
  'renewal_document_incomplete',
  'renewal_rent_schedule',
  'renewal_rent_schedule_error',
] as const

const renewalRecordTypes = new Set<string>(resolutionRequiredAdminNotificationTypes)

export function adminNotificationStaysOpenUntilResolved(typeValue: unknown) {
  const type = String(typeValue || '').trim().toLowerCase()
  return renewalRecordTypes.has(type)
}

export function adminNotificationHref(notification: AdminNotificationLinkInput, fallback = '/admin') {
  const type = String(notification.type || '').trim().toLowerCase()
  const camperId = String(notification.camper_id || '').trim()

  if (renewalRecordTypes.has(type)) {
    return camperId
      ? `/admin/renewals?camper=${encodeURIComponent(camperId)}&record=history`
      : '/admin/renewals'
  }

  return fallback
}
