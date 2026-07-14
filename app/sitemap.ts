import type { MetadataRoute } from 'next'

const siteUrl = 'https://www.buroakscampground.com'

export default function sitemap(): MetadataRoute.Sitemap {
  const pages = [
    ['', 1, 'weekly'],
    ['/availability', 0.95, 'weekly'],
    ['/seasonal-camping-near-st-louis', 0.9, 'monthly'],
    ['/seasonal-camping-near-edwardsville-il', 0.9, 'monthly'],
    ['/annual-rv-sites-metro-east', 0.9, 'monthly'],
    ['/members-only-seasonal-camping', 0.9, 'monthly'],
    ['/about', 0.8, 'monthly'],
    ['/amenities', 0.8, 'monthly'],
    ['/events', 0.8, 'weekly'],
    ['/gallery', 0.75, 'monthly'],
    ['/faq', 0.75, 'monthly'],
    ['/contact', 0.75, 'monthly'],
    ['/reviews', 0.65, 'monthly'],
    ['/blog', 0.6, 'monthly'],
  ] as const

  return pages.map(([path, priority, changeFrequency]) => ({
    url: `${siteUrl}${path}`,
    lastModified: new Date(),
    changeFrequency,
    priority,
  }))
}
