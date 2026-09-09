import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { adminAlertRecipients, sendAdminAlertEmail } from '../../../../lib/admin-alert-email'
import { camperCommunityEmails } from '../../../../lib/community-notifications'
import { communityStaffRecipients } from '../../../../lib/community-staff-alerts'
import { getSiteUrl } from '../../../../lib/site-url'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mzywctpxnpejglnspyqi.supabase.co'

function centralNow() {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(new Date())
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || ''
  return { date: `${value('year')}-${value('month')}-${value('day')}`, hour: Number(value('hour')) }
}

function compact(value: unknown, max = 90) {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: 'Cron is not authorized.' }, { status: 401 })
  const current = centralNow()
  if (current.hour !== 18) return NextResponse.json({ success: true, skipped: true, reason: 'Not the scheduled evening Central window.', current })
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) return NextResponse.json({ error: 'Supabase service key is not configured.' }, { status: 500 })
  const admin = createClient(supabaseUrl, key)
  const reportKey = 'daily-office-summary'
  const { data: reservation, error: reserveError } = await admin.from('scheduled_reports').insert({ report_key: reportKey, report_date: current.date, status: 'running' }).select('id').single()
  if (reserveError?.code === '23505') return NextResponse.json({ success: true, skipped: true, reason: 'Today\'s office summary was already handled.' })
  if (reserveError || !reservation) return NextResponse.json({ error: reserveError?.message || 'Unable to reserve the office summary.' }, { status: 500 })

  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const [postsResult, commentsResult, reactionsResult, reportsResult, dinnersResult, textsResult, campersResult] = await Promise.all([
      admin.from('community_posts').select('id,author_name,lot_number,body,created_at').gte('created_at', since),
      admin.from('community_comments').select('id,author_name,lot_number,body,created_at').gte('created_at', since),
      admin.from('community_reactions').select('id,created_at').gte('created_at', since),
      admin.from('community_reports').select('id,reason,status,created_at').gte('created_at', since),
      admin.from('saturday_dinner_signups').select('id,dinner_date,lot_number,camper_name,attending_status,bringing,guest_count,updated_at').gte('updated_at', since),
      admin.from('sms_broadcasts').select('id,reminder_type,message,status,recipient_count,sent_count,failed_count,created_at').gte('created_at', since),
      admin.from('campers').select('id,first_name,last_name,email,secondary_email,lot_number,role,active').eq('active', true),
    ])
    const firstError = [postsResult.error, commentsResult.error, reactionsResult.error, reportsResult.error, dinnersResult.error, textsResult.error, campersResult.error].find(Boolean)
    if (firstError) throw new Error(firstError.message)
    const posts = postsResult.data || []
    const comments = commentsResult.data || []
    const reactions = reactionsResult.data || []
    const reports = reportsResult.data || []
    const dinners = dinnersResult.data || []
    const texts = textsResult.data || []
    const activityCount = posts.length + comments.length + reactions.length + reports.length + dinners.length + texts.length
    if (!activityCount) {
      await admin.from('scheduled_reports').update({ status: 'sent', item_count: 0, office_email_status: 'skipped', printer_email_status: 'skipped', completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', reservation.id)
      return NextResponse.json({ success: true, skipped: true, reason: 'No routine office activity to summarize.' })
    }
    const staffEmails = communityStaffRecipients(campersResult.data || [], null).flatMap((camper) => camperCommunityEmails(camper))
    const recipients = Array.from(new Map([...adminAlertRecipients(), ...staffEmails].map((email) => [email.toLowerCase(), email])).values())
    const communityDetails = [
      ...posts.map((row: any) => `Post — ${row.author_name}${row.lot_number ? ` (Lot ${row.lot_number})` : ''}: ${compact(row.body)}`),
      ...comments.map((row: any) => `Comment — ${row.author_name}${row.lot_number ? ` (Lot ${row.lot_number})` : ''}: ${compact(row.body)}`),
    ].slice(0, 12).join(' | ')
    const dinnerDetails = dinners.slice(0, 12).map((row: any) => `${row.camper_name} (Lot ${row.lot_number || '?'}) — ${row.attending_status}, ${row.guest_count || 1} plate${Number(row.guest_count || 1) === 1 ? '' : 's'}${row.bringing ? `, bringing ${row.bringing}` : ''}`).join(' | ')
    const textDetails = texts.slice(0, 8).map((row: any) => `${row.reminder_type}: ${row.sent_count || 0}/${row.recipient_count || 0} sent${row.failed_count ? `, ${row.failed_count} failed` : ''} — ${compact(row.message)}`).join(' | ')
    const result: any = await sendAdminAlertEmail({
      subject: `Bur Oaks evening office summary - ${current.date}`,
      heading: 'Today at Bur Oaks',
      message: 'Here is the routine admin activity collected into one daily email. Nothing listed here needs to be cleared from Needs Attention.',
      details: [
        { label: 'Community', value: `${posts.length} post${posts.length === 1 ? '' : 's'}, ${comments.length} comment${comments.length === 1 ? '' : 's'}, ${reactions.length} like${reactions.length === 1 ? '' : 's'}, ${reports.length} report${reports.length === 1 ? '' : 's'}` },
        { label: 'Community activity', value: communityDetails || (reactions.length ? 'Likes only today; open the Community feed to view them.' : 'None today') },
        { label: 'Dinner responses', value: dinners.length ? dinnerDetails : 'None today' },
        { label: 'Text activity', value: texts.length ? textDetails : 'None today' },
      ],
      actionUrl: `${getSiteUrl()}/admin`,
      actionLabel: 'Open the admin portal',
      recipients,
    })
    const sent = !result?.skipped
    await admin.from('scheduled_reports').update({ status: sent ? 'sent' : 'failed', item_count: activityCount, office_email_status: sent ? 'sent' : 'failed', printer_email_status: 'skipped', error_message: result?.reason || null, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', reservation.id)
    return NextResponse.json({ success: sent, counts: { posts: posts.length, comments: comments.length, likes: reactions.length, reports: reports.length, dinners: dinners.length, texts: texts.length } }, { status: sent ? 200 : 502 })
  } catch (error: any) {
    await admin.from('scheduled_reports').update({ status: 'failed', error_message: String(error?.message || error).slice(0, 2000), completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', reservation.id)
    return NextResponse.json({ error: error?.message || 'Unable to send the office summary.' }, { status: 500 })
  }
}
