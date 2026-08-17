import { getSiteUrl } from './site-url'

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
}: {
  message: string
  path?: string
  linkLabel?: string
}) {
  return `Bur Oaks Campground: ${message.trim()}\n${linkLabel}: ${portalSmsUrl(path)}\nReply STOP to opt out.`
}
