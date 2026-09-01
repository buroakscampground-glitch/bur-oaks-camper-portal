import { NextResponse } from 'next/server'
import { getAuthenticatedContext } from '../../../lib/server-auth'
import { loadOperationsSnapshot, searchOperations } from '../../../lib/operations-health'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(request: Request) {
  const context = await getAuthenticatedContext(request)
  if (!context) return NextResponse.json({ error: 'Your admin session could not be verified.' }, { status: 401 })
  if (String(context.camper.role || '').toLowerCase() !== 'admin') {
    return NextResponse.json({ error: 'Admin access is required.' }, { status: 403 })
  }

  const url = new URL(request.url)
  const snapshot = await loadOperationsSnapshot(context.admin)

  if (url.searchParams.get('export') === '1') {
    const stamp = snapshot.today.slice(0, 7)
    return new NextResponse(JSON.stringify({
      exportType: 'Bur Oaks monthly operations backup',
      period: stamp,
      ...snapshot,
    }, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="bur-oaks-operations-${stamp}.json"`,
        'Cache-Control': 'no-store',
      },
    })
  }

  const query = url.searchParams.get('q') || ''
  return NextResponse.json({
    snapshot,
    search: searchOperations(snapshot, query),
    query,
  }, { headers: { 'Cache-Control': 'no-store' } })
}
