import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { effectivePortalRole } from '../../../lib/staff-roles'

export const runtime = 'nodejs'

const ONE_TIME_KEY = 'community_badge_cleanup_b81e293d'

function authorized(request: Request) {
  return request.headers.get('x-one-time-key') === ONE_TIME_KEY
}

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase is not configured.')
  return createClient(url, key)
}

async function audit(admin: any) {
  const { data: campers, error: camperError } = await admin.from('campers').select('id,first_name,last_name,lot_number,role,active').eq('active', true)
  if (camperError) throw camperError
  const staff = (campers || []).filter((camper: any) => ['admin', 'event_coordinator'].includes(effectivePortalRole(camper)))
  const staffIds = staff.map((camper: any) => camper.id)
  const [{ data: communityRows, error: communityError }, { data: adminRows, error: adminError }] = await Promise.all([
    staffIds.length
      ? admin.from('community_notifications').select('id,camper_id,post_id,message,created_at').in('camper_id', staffIds).is('read_at', null)
      : Promise.resolve({ data: [], error: null }),
    admin.from('admin_notifications').select('id,type').is('read_at', null),
  ])
  if (communityError || adminError) throw communityError || adminError

  const adminTypes = (adminRows || []).reduce((counts: Record<string, number>, row: any) => {
    const type = String(row.type || 'unknown')
    counts[type] = (counts[type] || 0) + 1
    return counts
  }, {})

  return {
    staff: staff.map((camper: any) => ({ id: camper.id, name: `${camper.first_name || ''} ${camper.last_name || ''}`.trim(), role: effectivePortalRole(camper) })),
    communityUnread: (communityRows || []).length,
    communityUnreadLikes: (communityRows || []).filter((row: any) => /liked a Community post\./i.test(String(row.message || ''))).length,
    communityUnreadConversations: new Set((communityRows || []).map((row: any) => String(row.post_id || row.id))).size,
    adminUnread: (adminRows || []).length,
    adminTypes,
  }
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  try {
    return NextResponse.json(await audit(adminClient()))
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || String(error) }, { status: 500 })
  }
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  try {
    const admin = adminClient()
    const before = await audit(admin)
    const staffIds = before.staff.map((camper: any) => camper.id)
    const now = new Date().toISOString()
    const { data: cleared, error } = staffIds.length
      ? await admin.from('community_notifications').update({ read_at: now }).in('camper_id', staffIds).is('read_at', null).ilike('message', '%liked a Community post.%').select('id')
      : { data: [], error: null }
    if (error) throw error
    return NextResponse.json({ success: true, clearedLikeAlerts: (cleared || []).length, before, after: await audit(admin) })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || String(error) }, { status: 500 })
  }
}
