import { getSiteUrl } from './site-url'
import { normalizeGsmSms, singleSegmentSms } from './sms-segments'

export function portalSmsUrl(path = '/portal') {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${getSiteUrl()}${normalizedPath}`
}

export function portalPathForTextType(reminderType: unknown) {
  const type = String(reminderType || '').toLowerCase()

  if (type.includes('invoice') || type.includes('bill') || type.includes('balance')) return '/invoices'
  if (type.includes('electric') || type.includes('utility')) return '/electric'
  if (type.includes('event') || type.includes('dinner')) return '/calendar'
  if (type.includes('maintenance')) return '/maintenance'
  if (type.includes('document') || type.includes('renewal')) return '/documents'
  if (type.includes('message') || type.includes('chat')) return '/messages'
  if (type.includes('site care')) return '/portal#site-care'
  if (type.includes('pump') || type.includes('sewer')) return '/portal'

  return '/portal'
}

export function camperTextWithLink({
  message,
  path = '/portal',
  linkLabel = 'Click here to view',
  compact = false,
}: {
  message: string
  path?: string
  linkLabel?: string
  compact?: boolean
}) {
  const action = linkLabel.replace(/click here to /i, '').replace(/open the portal to /i, '').trim() || 'View'
  if (compact) {
    return singleSegmentSms({ message, url: portalSmsUrl(path), action })
  }

  return normalizeGsmSms(`Bur Oaks Campground: ${message.trim()} ${action}: ${portalSmsUrl(path)} Reply STOP to opt out.`)
}
