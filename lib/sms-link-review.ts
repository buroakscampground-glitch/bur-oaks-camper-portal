export type SmsLinkReview = {
  links: string[]
  officialLinks: string[]
  externalLinks: string[]
  blockedLinks: string[]
}

const shortenerHosts = new Set([
  'bit.ly',
  'tinyurl.com',
  't.co',
  'goo.gl',
  'ow.ly',
  'buff.ly',
  'is.gd',
  'rebrand.ly',
])

function cleanLink(value: string) {
  return value.replace(/[),.;!?]+$/g, '')
}

/** Review staff-entered links before a bulk text. The portal link added by the server is reviewed separately. */
export function reviewSmsLinks(message: unknown): SmsLinkReview {
  const matches = String(message || '').match(/(?:https?:\/\/|www\.)[^\s<>"']+/gi) || []
  const links = Array.from(new Set(matches.map(cleanLink)))
  const officialLinks: string[] = []
  const externalLinks: string[] = []
  const blockedLinks: string[] = []

  for (const link of links) {
    try {
      const candidate = link.toLowerCase().startsWith('www.') ? `https://${link}` : link
      const url = new URL(candidate)
      const host = url.hostname.toLowerCase().replace(/^www\./, '')
      const unsafeCredentials = Boolean(url.username || url.password)
      const unsafeProtocol = url.protocol !== 'https:'

      if (unsafeProtocol || unsafeCredentials || shortenerHosts.has(host)) {
        blockedLinks.push(link)
      } else if (host === 'buroakscampground.com' || host.endsWith('.buroakscampground.com')) {
        officialLinks.push(link)
      } else {
        externalLinks.push(link)
      }
    } catch {
      blockedLinks.push(link)
    }
  }

  return { links, officialLinks, externalLinks, blockedLinks }
}
