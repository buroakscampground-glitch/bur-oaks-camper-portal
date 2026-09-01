import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { sendAdminAlertEmail } from '../../../../lib/admin-alert-email'
import { loadOperationsSnapshot } from '../../../../lib/operations-health'
import { getSiteUrl } from '../../../../lib/site-url'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mzywctpxnpejglnspyqi.supabase.co'

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET
  return Boolean(secret && request.headers.get('authorization') === `Bearer ${secret}`)
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) return NextResponse.json({ error: 'Supabase service key is not configured.' }, { status: 500 })

  const admin = createClient(supabaseUrl, key)
  const snapshot = await loadOperationsSnapshot(admin)
  const attention = snapshot.health.filter((item: any) => item.count > 0)
  const result = await sendAdminAlertEmail({
    subject: `Bur Oaks weekly operations summary — ${snapshot.today}`,
    heading: 'Your weekly campground summary',
    message: attention.length
      ? `${attention.length} areas need attention this week. The details below come directly from the live portal.`
      : 'Everything monitored by the portal is currently caught up.',
    details: [
      { label: 'Money collected', value: `$${snapshot.totals.paidRevenue.toFixed(2)}` },
      { label: 'Open balance', value: `$${snapshot.totals.openBalance.toFixed(2)}` },
      { label: 'Past-due balance', value: `$${snapshot.totals.pastDueBalance.toFixed(2)}` },
      { label: 'Electric invoiced this month', value: `$${snapshot.totals.electricInvoiced.toFixed(2)}` },
      { label: 'Electric sites left', value: snapshot.totals.electricSitesLeft },
      { label: 'Unsigned documents', value: snapshot.totals.unsignedDocuments },
      { label: 'Open maintenance', value: snapshot.totals.openMaintenance },
      { label: 'Pump-outs waiting', value: snapshot.totals.openPumpOuts },
      { label: 'Unread office messages', value: snapshot.totals.unreadMessages },
      { label: 'Failed deliveries', value: snapshot.totals.failedDeliveries },
    ],
    actionUrl: `${getSiteUrl()}/admin/system-health`,
    actionLabel: 'Open system health',
  })

  return NextResponse.json({ success: true, date: snapshot.today, attention: attention.length, result })
}
