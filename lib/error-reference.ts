export function safeErrorReference(digest: unknown) {
  if (typeof digest !== 'string') return ''
  const normalized = digest.trim()
  return /^[a-z0-9-]{4,40}$/i.test(normalized) ? normalized : ''
}
