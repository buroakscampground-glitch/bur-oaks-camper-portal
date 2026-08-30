import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { runPendingDocumentSignatureReminders } from '../../../../lib/document-reminders'

export const dynamic = 'force-dynamic'

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET
  return Boolean(secret && request.headers.get('authorization') === `Bearer ${secret}`)
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: 'Not authorized.' }, { status: 401 })
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return NextResponse.json({ error: 'Production database is unavailable.' }, { status: 500 })

  try {
    const result = await runPendingDocumentSignatureReminders(createClient(url, key))
    return NextResponse.json({ success: true, intervalDays: 3, ...result })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Unable to run document reminders.' }, { status: 500 })
  }
}
