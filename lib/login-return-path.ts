const camperPaths = [
  '/portal',
  '/messages',
  '/invoices',
  '/documents',
  '/calendar',
  '/events',
  '/electric',
  '/maintenance',
  '/profile',
  '/directory',
  '/dinners',
  '/site',
]

function pathMatches(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

export function safeLoginReturnPath(value: unknown, role: unknown) {
  const requested = String(value || '').trim()
  if (!requested.startsWith('/') || requested.startsWith('//') || requested.includes('\\')) return ''

  let parsed: URL
  try {
    parsed = new URL(requested, 'https://portal.buroaks.invalid')
  } catch {
    return ''
  }

  if (parsed.origin !== 'https://portal.buroaks.invalid') return ''

  const normalizedRole = String(role || '').trim().toLowerCase()
  const allowed = normalizedRole === 'admin'
    ? pathMatches(parsed.pathname, '/admin')
    : normalizedRole === 'event_coordinator'
      ? pathMatches(parsed.pathname, '/community')
    : normalizedRole === 'maintenance'
      ? pathMatches(parsed.pathname, '/maintenance/dashboard')
      : normalizedRole === 'camper'
        ? camperPaths.some((prefix) => pathMatches(parsed.pathname, prefix))
        : false

  return allowed ? `${parsed.pathname}${parsed.search}${parsed.hash}` : ''
}
