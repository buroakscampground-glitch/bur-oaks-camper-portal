import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { announcementRemoveOnDate, isAnnouncementExpired } from '../../../../lib/announcement-expiration'

export const dynamic = 'force-dynamic'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mzywctpxnpejglnspyqi.supabase.co'

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET
  return Boolean(secret && request.headers.get('authorization') === `Bearer ${secret}`)
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) return NextResponse.json({ error: 'Supabase service key is not configured.' }, { status: 500 })

  const admin = createClient(supabaseUrl, key)
  const { data, error } = await admin
    .from('announcements')
    .select('id,title,message,created_at')
    .eq('is_active', true)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const expired = (data || []).filter((item) => isAnnouncementExpired(item))
  if (expired.length) {
    const { error: updateError } = await admin
      .from('announcements')
      .update({ is_active: false })
      .in('id', expired.map((item) => item.id))
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    checked: data?.length || 0,
    archived: expired.map((item) => ({
      id: item.id,
      title: item.title,
      removeOn: announcementRemoveOnDate(item),
    })),
  })
}
