import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { sendAdminAlertEmail } from '../../../../lib/admin-alert-email'
import { loadOperationsSnapshot } from '../../../../lib/operations-health'
import { getSiteUrl } from '../../../../lib/site-url'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mzywctpxnpejglnspyqi.supabase.co'

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) return NextResponse.json({ error: 'Supabase service key is not configured.' }, { status: 500 })

  const snapshot = await loadOperationsSnapshot(createClient(supabaseUrl, key))
  const month = snapshot.today.slice(0, 7)
  const result = await sendAdminAlertEmail({
    subject: `Bur Oaks monthly operations record is ready — ${month}`,
    heading: 'Your monthly portal record is ready',
    message: 'The portal completed its month-start operations check. Open System Health and tap “Download monthly backup” to save a dated copy for your records.',
    details: [
      { label: 'Active camper sites', value: snapshot.totals.activeCampers },
      { label: 'Open balance', value: `$${snapshot.totals.openBalance.toFixed(2)}` },
      { label: 'Past-due balance', value: `$${snapshot.totals.pastDueBalance.toFixed(2)}` },
      { label: 'Unsigned documents', value: snapshot.totals.unsignedDocuments },
      { label: 'Open maintenance', value: snapshot.totals.openMaintenance },
      { label: 'Delivery failures', value: snapshot.totals.failedDeliveries },
    ],
    actionUrl: `${getSiteUrl()}/admin/system-health`,
    actionLabel: 'Open and download backup',
  })

  return NextResponse.json({ success: true, month, result })
}
