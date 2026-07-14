import React from 'react'
import type { Metadata } from 'next'
import './globals.css'
import GlobalBackButton from '../components/GlobalBackButton'
import CamperChrome from '../components/CamperChrome'
import AuthLinkRedirect from '../components/AuthLinkRedirect'
import GoogleAnalytics from '../components/GoogleAnalytics'

const siteUrl = 'https://www.buroakscampground.com'

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'Bur Oaks Campground | Seasonal Camping Near St. Louis',
    template: '%s | Bur Oaks Campground',
  },
  description: 'A private, family-friendly seasonal campground and members-only RV community in Alhambra, Illinois, serving the Metro East and greater St. Louis area.',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    siteName: 'Bur Oaks Campground',
    title: 'Bur Oaks Campground | A Site to Remember',
    description: 'Private seasonal camping, annual RV sites, community events, and peaceful lake views near St. Louis.',
    images: [{ url: '/site-photos/IMG_8010.jpeg', width: 1428, height: 1071, alt: 'Bur Oaks Campground lakefront' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Bur Oaks Campground | A Site to Remember',
    description: 'A private seasonal campground and members-only RV community near St. Louis.',
    images: ['/site-photos/IMG_8010.jpeg'],
  },
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION || undefined,
  },
  other: {
    'geo.region': 'US-IL',
    'geo.placename': 'Alhambra',
  },
}

const campgroundSchema = {
  '@context': 'https://schema.org',
  '@type': 'Campground',
  '@id': `${siteUrl}/#campground`,
  name: 'Bur Oaks Campground',
  alternateName: 'Bur Oaks Campground (Members Only)',
  url: siteUrl,
  logo: `${siteUrl}/bur-oaks-logo.png`,
  image: [
    `${siteUrl}/site-photos/IMG_8010.jpeg`,
    `${siteUrl}/site-photos/IMG_8008.jpeg`,
    `${siteUrl}/site-photos/IMG_8012.jpeg`,
  ],
  description: 'A private, seasonal, members-only campground with annual RV sites, family activities, community events, and a peaceful lake in Alhambra, Illinois.',
  telephone: '+1-618-488-7927',
  email: 'buroakscampground@gmail.com',
  foundingDate: '1972-03',
  priceRange: '$$',
  address: {
    '@type': 'PostalAddress',
    streetAddress: '10303 Oaks Rd',
    addressLocality: 'Alhambra',
    addressRegion: 'IL',
    postalCode: '62001',
    addressCountry: 'US',
  },
  areaServed: ['Metro East', 'Greater St. Louis', 'Madison County', 'St. Clair County', 'St. Louis County', 'St. Charles County'],
  amenityFeature: [
    { '@type': 'LocationFeatureSpecification', name: 'RV camping', value: true },
    { '@type': 'LocationFeatureSpecification', name: 'Wheelchair accessible parking', value: true },
    { '@type': 'LocationFeatureSpecification', name: 'Public restroom', value: true },
    { '@type': 'LocationFeatureSpecification', name: 'Dogs allowed', value: true },
  ],
  sameAs: ['https://www.facebook.com/Bur-Oaks-Campground-108171435891984/'],
  openingHoursSpecification: [
    {
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
      opens: '09:00',
      closes: '18:00',
    },
  ],
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(campgroundSchema) }} />
        <GoogleAnalytics />
        <AuthLinkRedirect />
        <CamperChrome>{children}</CamperChrome>
        <GlobalBackButton />
      </body>
    </html>
  )
}
