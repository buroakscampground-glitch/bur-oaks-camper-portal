import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { centralDate } from '../../../../lib/camper-celebrations'
import { isOperationalCamper } from '../../../../lib/camper-records'
import { camperCommunityEmails, normalizeCommunityMode, sendCommunityEmail } from '../../../../lib/community-notifications'

export const dynamic = 'force-dynamic'
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mzywctpxnpejglnspyqi.supabase.co'

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) return NextResponse.json({ error: 'Supabase service key is not configured.' }, { status: 500 })
  const admin = createClient(supabaseUrl, key)
  const now = new Date()
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
  const digestDate = centralDate(now).iso

  const [{ data: posts, error: postError }, { data: campers, error: camperError }, { data: preferences, error: preferenceError }] = await Promise.all([
    admin.from('community_posts').select('id,camper_id,author_name,body,is_official,created_at').eq('status', 'published').gte('created_at', since).order('created_at', { ascending: false }).limit(100),
    admin.from('campers').select('id,first_name,last_name,email,secondary_email,active,role').eq('active', true),
    admin.from('community_notification_preferences').select('camper_id,community_mode'),
  ])
  if (postError || camperError || preferenceError) return NextResponse.json({ error: postError?.message || camperError?.message || preferenceError?.message }, { status: 500 })
  if (!(posts || []).length) return NextResponse.json({ success: true, digestDate, posts: 0, sent: 0, skipped: 0, failed: 0 })

  const eligible = (campers || []).filter(isOperationalCamper)
  const summary = { success: true, digestDate, posts: (posts || []).length, campers: eligible.length, sent: 0, skipped: 0, failed: 0 }
  const origin = 'https://www.buroakscampground.com'
  const notifiedEmails = new Set<string>()

  for (let index = 0; index < eligible.length; index += 8) {
    await Promise.all(eligible.slice(index, index + 8).map(async (camper: any) => {
      const preference = (preferences || []).find((item: any) => String(item.camper_id) === String(camper.id))
      if (normalizeCommunityMode(preference?.community_mode) !== 'daily_summary') { summary.skipped += 1; return }
      const relevantPosts = (posts || []).filter((post: any) => String(post.camper_id) !== String(camper.id))
      if (!relevantPosts.length) { summary.skipped += 1; return }
      const email = camperCommunityEmails(camper).find((value) => !notifiedEmails.has(value))
      if (!email) { summary.skipped += 1; return }
      notifiedEmails.add(email)

      const { data: reservation, error: reserveError } = await admin.from('community_digest_deliveries').upsert({ camper_id: camper.id, digest_date: digestDate, post_count: relevantPosts.length, email_status: 'sending', updated_at: new Date().toISOString() }, { onConflict: 'camper_id,digest_date', ignoreDuplicates: true }).select('camper_id').maybeSingle()
      if (reserveError || !reservation) { summary.skipped += 1; return }
      const name = [camper.first_name, camper.last_name].filter(Boolean).join(' ') || 'there'
      try {
        const result: any = await sendCommunityEmail({
          to: [email],
          camperName: name,
          subject: `${relevantPosts.length} new Bur Oaks Community post${relevantPosts.length === 1 ? '' : 's'}`,
          heading: 'Today in the Community',
          message: `There ${relevantPosts.length === 1 ? 'is' : 'are'} ${relevantPosts.length} new Community post${relevantPosts.length === 1 ? '' : 's'} waiting for you. Open the portal when it is convenient—there is no need to respond right away.`,
          actionUrl: `${origin}/campground-community`,
        })
        const status = result?.skipped ? 'skipped' : 'sent'
        await admin.from('community_digest_deliveries').update({ email_status: status, provider_message_id: result?.id || null, error_message: result?.reason || null, updated_at: new Date().toISOString() }).eq('camper_id', camper.id).eq('digest_date', digestDate)
        if (status === 'sent') summary.sent += 1
        else summary.skipped += 1
      } catch (error: any) {
        summary.failed += 1
        await admin.from('community_digest_deliveries').update({ email_status: 'failed', error_message: String(error?.message || error).slice(0, 500), updated_at: new Date().toISOString() }).eq('camper_id', camper.id).eq('digest_date', digestDate)
      }
    }))
  }

  return NextResponse.json(summary)
}
