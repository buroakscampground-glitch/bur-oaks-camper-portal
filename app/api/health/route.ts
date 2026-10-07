import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      service: 'bur-oaks-portal',
      checkedAt: new Date().toISOString(),
      release: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) || 'local',
    },
    {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    },
  )
}
