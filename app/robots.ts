import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin/', '/portal/', '/profile/', '/invoices/', '/documents/', '/api/'],
    },
    sitemap: 'https://www.buroakscampground.com/sitemap.xml',
    host: 'https://www.buroakscampground.com',
  }
}
