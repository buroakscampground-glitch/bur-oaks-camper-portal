import { NextResponse } from 'next/server'
import { runPendingDocumentSignatureReminders } from '../../../lib/document-reminders'
import { getAuthenticatedContext } from '../../../lib/server-auth'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const context = await getAuthenticatedContext(request)
  if (!context || String(context.camper.role || '').toLowerCase() !== 'admin') {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const documentIds: string[] = Array.from(new Set<string>(
    (Array.isArray(body.documentIds) ? body.documentIds : [body.documentId])
      .map((id: unknown) => String(id || '').trim())
      .filter(Boolean)
  )).slice(0, 100)
  if (!documentIds.length) return NextResponse.json({ error: 'Choose a document first.' }, { status: 400 })

  try {
    const result = await runPendingDocumentSignatureReminders(context.admin, documentIds)
    return NextResponse.json({ success: true, ...result })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Unable to send the document notice.' }, { status: 500 })
  }
}
