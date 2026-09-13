import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { communityActorAuthor, OFFICIAL_COMMUNITY_NAME } from '../../../lib/community-branding'
import { textCampersAboutStaffPost } from '../../../lib/community-post-text-server'
import { canManageCommunity, effectivePortalRole } from '../../../lib/staff-roles'

export const runtime = 'nodejs'
export const maxDuration = 300

const ONE_TIME_KEY = 'community_replay_5c9c4f1e7b3a'

function authorized(request: Request) {
  return request.headers.get('x-one-time-key') === ONE_TIME_KEY
}

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase is not configured.')
  return createClient(url, key)
}

async function staffPosts(admin: any) {
  const { data: posts, error: postError } = await admin.from('community_posts').select('*').order('created_at', { ascending: false }).limit(10)
  if (postError) throw postError
  const camperIds = Array.from(new Set((posts || []).map((post: any) => post.camper_id).filter(Boolean)))
  const { data: campers, error: camperError } = camperIds.length
    ? await admin.from('campers').select('id,first_name,last_name,lot_number,role').in('id', camperIds)
    : { data: [], error: null }
  if (camperError) throw camperError
  const byId = new Map((campers || []).map((camper: any) => [String(camper.id), camper]))

  return (posts || []).flatMap((post: any) => {
    const camper: any = byId.get(String(post.camper_id))
    if (!camper || !canManageCommunity(effectivePortalRole(camper))) return []
    return [{
      id: post.id,
      author: post.is_official ? OFFICIAL_COMMUNITY_NAME : communityActorAuthor({ ...camper, role: effectivePortalRole(camper) }),
      body: post.body,
      createdAt: post.created_at,
      post,
      camper,
    }]
  })
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  try {
    const admin = adminClient()
    const posts = await staffPosts(admin)
    const ids = posts.map((item: any) => item.id)
    const { data: broadcasts } = ids.length ? await admin.from('sms_broadcasts').select('idempotency_key,status,sent_count,failed_count').in('idempotency_key', ids) : { data: [] }
    return NextResponse.json({ posts: posts.map(({ post: _post, camper: _camper, ...item }: any) => ({ ...item, broadcast: (broadcasts || []).find((row: any) => row.idempotency_key === item.id) || null })) })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || String(error) }, { status: 500 })
  }
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  try {
    const { postId } = await request.json().catch(() => ({}))
    const admin = adminClient()
    const match = (await staffPosts(admin)).find((item: any) => String(item.id) === String(postId || ''))
    if (!match) return NextResponse.json({ error: 'That recent staff post was not found.' }, { status: 404 })
    const result = await textCampersAboutStaffPost({ admin, user: { id: null, email: 'one-time-community-replay' }, post: match.post, author: match.author })
    return NextResponse.json({ success: result.status === 'sent' || result.status === 'partial', post: { id: match.id, author: match.author, body: match.body, createdAt: match.createdAt }, result })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || String(error) }, { status: 500 })
  }
}
