export function documentSigningPath(documentId: unknown) {
  const id = String(documentId || '').trim()
  return id ? `/documents?sign=${encodeURIComponent(id)}` : '/documents'
}

export function documentSigningUrl(siteUrl: unknown, documentId: unknown) {
  return `${String(siteUrl || '').replace(/\/$/, '')}${documentSigningPath(documentId)}`
}
