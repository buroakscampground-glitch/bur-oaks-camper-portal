import { NextResponse } from 'next/server'
import { getAuthenticatedContext } from '../../../lib/server-auth'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const context = await getAuthenticatedContext(request)

  if (!context || String(context.camper.role || '').toLowerCase() !== 'admin') {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  const { data, error } = await context.admin
    .from('documents')
    .select('*')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const documents = [...(data || [])].sort((a, b) => {
    const signedAtA = a.signed_at ? new Date(a.signed_at).getTime() : 0
    const signedAtB = b.signed_at ? new Date(b.signed_at).getTime() : 0
    if (signedAtA !== signedAtB) return signedAtB - signedAtA
    return String(a.document_name || '').localeCompare(String(b.document_name || ''))
  })

  return NextResponse.json({ documents })
}
