const fallbackSiteUrl = 'https://www.buroakscampground.com'

export function getSiteUrl() {
  const configured =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.SITE_URL ||
    fallbackSiteUrl

  return configured.replace(/\/+$/, '')
}

