import { NextResponse } from 'next/server'

export function GET() {
  return NextResponse.json({
    id: '/portal',
    name: 'Bur Oaks Camper Portal',
    short_name: 'Bur Oaks Camper',
    description: 'The Bur Oaks Campground camper portal',
    start_url: '/portal',
    scope: '/',
    display: 'standalone',
    background_color: '#f4ead8',
    theme_color: '#244a35',
    icons: [
      {
        src: '/bur-oaks-logo.png',
        sizes: '1254x1254',
        type: 'image/png',
        purpose: 'any maskable',
      },
    ],
  }, {
    headers: {
      'Cache-Control': 'public, max-age=3600',
      'Content-Type': 'application/manifest+json',
    },
  })
}
