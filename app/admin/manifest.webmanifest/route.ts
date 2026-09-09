import { NextResponse } from 'next/server'

export function GET() {
  return NextResponse.json({
    id: '/admin',
    name: 'Bur Oaks Admin',
    short_name: 'Bur Oaks Admin',
    description: 'Bur Oaks Campground operations portal',
    start_url: '/admin',
    scope: '/admin',
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
