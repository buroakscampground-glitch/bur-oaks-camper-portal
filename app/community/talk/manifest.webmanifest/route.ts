import { NextResponse } from 'next/server'

export function GET() {
  return NextResponse.json({
    id: '/community/talk',
    name: 'Bur Oaks Community Talk',
    short_name: 'Community Talk',
    description: 'Bur Oaks Campground community conversation',
    start_url: '/community/talk',
    scope: '/community/talk',
    display: 'standalone',
    background_color: '#f5f2ea',
    theme_color: '#173722',
    icons: [{ src: '/bur-oaks-logo.png', sizes: '1254x1254', type: 'image/png', purpose: 'any maskable' }],
  }, {
    headers: {
      'Cache-Control': 'public, max-age=3600',
      'Content-Type': 'application/manifest+json',
    },
  })
}
