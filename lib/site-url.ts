const fallbackSiteUrl = 'https://www.buroakscampground.com'

export function getSiteUrl() {
  const configured =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.SITE_URL ||
    fallbackSiteUrl

  const normalized = configured.replace(/\/+$/, '')

  if (
    normalized.includes('localhost') ||
    normalized.includes('127.0.0.1') ||
    normalized.includes('bur-oaks-camper-portal-tace')
  ) {
    return fallbackSiteUrl
  }

  return normalized
}
