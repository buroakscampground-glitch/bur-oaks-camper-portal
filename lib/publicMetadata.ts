import type { Metadata } from 'next'

export function publicPageMetadata(
  title: string,
  description: string,
  path: string,
  image = '/site-photos/IMG_8010.jpeg',
): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title: `${title} | Bur Oaks Campground`,
      description,
      url: path,
      images: [{ url: image, alt: 'Bur Oaks Campground' }],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${title} | Bur Oaks Campground`,
      description,
      images: [image],
    },
  }
}
