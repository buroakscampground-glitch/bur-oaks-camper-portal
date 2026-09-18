import { NextResponse } from 'next/server'
import { runWaitlistCheckIns } from '../cron/waitlist-check-ins/route'

export const dynamic = 'force-dynamic'

const oneTimeToken = 'waitlist_18sep_9f4e7b2c61ad43e8b7f05c9d'

export async function POST(request: Request) {
  if (request.headers.get('x-one-time-token') !== oneTimeToken) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  try {
    return NextResponse.json(await runWaitlistCheckIns())
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Waitlist check-ins failed.' }, { status: 500 })
  }
}
