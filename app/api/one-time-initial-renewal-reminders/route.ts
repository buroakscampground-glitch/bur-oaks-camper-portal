import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { runPendingDocumentSignatureReminders } from '../../../lib/document-reminders'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ONE_TIME_KEY = 'dd68e5492c96923bfbf0b4895d28560b7a2d003cbadc7d35'

export async function POST(request: Request) {
  if (request.headers.get('x-one-time-key') !== ONE_TIME_KEY) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return NextResponse.json({ error: 'Production database is unavailable.' }, { status: 500 })
  const admin = createClient(url, key)

  try {
    const { data: documents, error } = await admin
      .from('documents')
      .select('id,document_name,document_type,signature_status')
      .in('signature_status', ['pending', 'pending_second_signature'])
    if (error) throw new Error(error.message)
    const renewalIds = (documents || [])
      .filter((document: any) => /renew|lease|contract/.test(`${document.document_name || ''} ${document.document_type || ''}`.toLowerCase()))
      .map((document: any) => String(document.id))
    const result = await runPendingDocumentSignatureReminders(admin, renewalIds)
    return NextResponse.json({ success: true, renewalDocuments: renewalIds.length, ...result })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Unable to send the initial renewal reminders.' }, { status: 500 })
  }
}
