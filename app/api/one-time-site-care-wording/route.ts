import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const oneTimeKey = 'site-care-acknowledgment-safe-2026-09-01'
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mzywctpxnpejglnspyqi.supabase.co'

export async function GET(request: Request) {
  if (request.headers.get('x-one-time-key') !== oneTimeKey) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 401 })
  }
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) return NextResponse.json({ error: 'Service key missing.' }, { status: 500 })
  const admin = createClient(supabaseUrl, serviceRoleKey)
  const { data: notices, error } = await admin
    .from('site_care_notices')
    .select('id,lot_number,status,message')
    .like('template_key', 'auto:%')
    .neq('status', 'Resolved')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const updated = []
  for (const notice of notices || []) {
    const oldPhrase = 'If this is not marked ready for office review by the automatic date'
    const newPhrase = 'If this is not acknowledged or marked ready for office review by the automatic date'
    const message = String(notice.message || '').replace(oldPhrase, newPhrase)
    if (message !== notice.message) {
      const { error: updateError } = await admin.from('site_care_notices').update({ message }).eq('id', notice.id)
      if (updateError) return NextResponse.json({ error: updateError.message, noticeId: notice.id }, { status: 500 })
      updated.push({ id: notice.id, lot: notice.lot_number, status: notice.status })
    }
  }
  return NextResponse.json({ success: true, updated })
}
