import { NextResponse } from 'next/server'

export function GET() {
  return NextResponse.json({
    id: '/community',
    name: 'Bur Oaks Community',
    short_name: 'Bur Oaks Community',
    description: 'Bur Oaks Campground Event Coordinator portal',
    start_url: '/community',
    scope: '/community',
    display: 'standalone',
    background_color: '#f5f2ea',
    theme_color: '#173722',
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
