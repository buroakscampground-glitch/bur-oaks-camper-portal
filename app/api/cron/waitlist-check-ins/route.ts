import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getSiteUrl } from '../../../../lib/site-url'
import {
  createWaitlistManageToken,
  sendWaitlistCheckInEmail,
  waitlistCheckInIsDue,
} from '../../../../lib/waitlist-check-in'

export const dynamic = 'force-dynamic'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mzywctpxnpejglnspyqi.supabase.co'

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET
  return Boolean(secret && request.headers.get('authorization') === `Bearer ${secret}`)
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return NextResponse.json({ error: 'Supabase service key is not configured.' }, { status: 500 })

  const admin = createClient(supabaseUrl, serviceKey)
  const now = new Date()
  const { data: entries, error } = await admin
    .from('waitlist')
    .select('id,first_name,email,status,created_at,last_check_in_at,removed_at')
    .in('status', ['Waiting', 'Contacted'])
    .is('removed_at', null)
    .not('email', 'is', null)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const due = (entries || [])
    .filter((entry) => String(entry.email || '').trim())
    .filter((entry) => waitlistCheckInIsDue(entry.created_at, entry.last_check_in_at, now))
  const summary = { checked: entries?.length || 0, due: due.length, sent: 0, failed: 0, results: [] as Array<Record<string, unknown>> }

  for (const entry of due) {
    const email = String(entry.email || '').trim().toLowerCase()
    try {
      const token = createWaitlistManageToken({ id: String(entry.id), email })
      const manageUrl = `${getSiteUrl()}/api/waitlist/manage?token=${encodeURIComponent(token)}`
      await sendWaitlistCheckInEmail({
        to: email,
        firstName: String(entry.first_name || '').trim(),
        manageUrl,
      })
      const sentAt = new Date().toISOString()
      const { error: updateError } = await admin
        .from('waitlist')
        .update({ last_check_in_at: sentAt })
        .eq('id', entry.id)
        .is('removed_at', null)
      if (updateError) throw updateError
      summary.sent += 1
      summary.results.push({ id: entry.id, sent: true, sentAt })
    } catch (sendError: any) {
      summary.failed += 1
      summary.results.push({ id: entry.id, sent: false, error: sendError?.message || 'Unknown email error' })
    }
  }

  return NextResponse.json({ success: summary.failed === 0, ...summary })
}
