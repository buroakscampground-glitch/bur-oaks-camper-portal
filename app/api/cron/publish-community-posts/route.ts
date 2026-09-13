import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { textCampersAboutStaffPost } from '../../../../lib/community-post-text-server'
import { isOperationalCamper } from '../../../../lib/camper-records'
import { canManageCommunity } from '../../../../lib/staff-roles'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mzywctpxnpejglnspyqi.supabase.co'

function centralHour(date = new Date()) {
  const part = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: '2-digit', hourCycle: 'h23' }).formatToParts(date).find((item) => item.type === 'hour')
  return Number(part?.value ?? -1)
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  if (centralHour() !== 8) return NextResponse.json({ success: true, skipped: true, reason: 'Scheduled Community posts publish at 8 AM Central.' })
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) return NextResponse.json({ error: 'Supabase service key is not configured.' }, { status: 500 })
  const admin = createClient(supabaseUrl, key)
  const now = new Date().toISOString()

  await admin.from('community_posts').update({ status: 'hidden', updated_at: now }).eq('status', 'published').lte('expires_at', now)

  const { data: duePosts, error } = await admin.from('community_posts').select('*').eq('status', 'scheduled').lte('publish_at', now).order('publish_at', { ascending: true }).limit(20)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const results: any[] = []
  for (const duePost of duePosts || []) {
    const { data: post } = await admin.from('community_posts').update({ status: 'published', updated_at: now }).eq('id', duePost.id).eq('status', 'scheduled').select('*').maybeSingle()
    if (!post) continue
    const { data: author } = await admin.from('campers').select('*').eq('id', post.camper_id).maybeSingle()
    let textResult: any = { status: 'skipped', reason: 'The author is not a staff account.' }
    if (author && canManageCommunity(author.role) && post.send_text !== false) {
      textResult = await textCampersAboutStaffPost({ admin, user: { id: null, email: author.email || 'Scheduled Community post' }, post, author: post.author_name })
    }
    if (post.is_official) {
      const { data: campers } = await admin.from('campers').select('id,lot_number,role').eq('active', true)
      const notifications = (campers || []).filter((camper: any) => isOperationalCamper(camper) && String(camper.id) !== String(post.camper_id)).map((camper: any) => ({ camper_id: camper.id, post_id: post.id, kind: 'official', message: `New official Community post: ${String(post.body || '').slice(0, 120)}` }))
      if (notifications.length) await admin.from('community_notifications').upsert(notifications, { onConflict: 'camper_id,post_id,kind', ignoreDuplicates: true })
    }
    results.push({ postId: post.id, textStatus: textResult.status, sent: textResult.sentCount || 0, failed: textResult.failedCount || 0 })
  }
  return NextResponse.json({ success: true, published: results.length, results })
}
