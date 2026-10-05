import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { communityEventCounts, isThanksgivingCommunityEvent } from '../../../lib/community-event-counts'
import { thanksgivingDinnerDate } from '../../../lib/thanksgiving-dinner'

export const dynamic = 'force-dynamic'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mzywctpxnpejglnspyqi.supabase.co'

export async function GET() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) return NextResponse.json({ error: 'Service key unavailable.' }, { status: 500 })
  const admin = createClient(supabaseUrl, serviceRoleKey)

  const [eventResult, rsvpResult, dinnerResult, camperResult] = await Promise.all([
    admin.from('events').select('id,title,event_date,description,created_at').order('event_date', { ascending: true }),
    admin.from('event_rsvps').select('id,event_id,camper_id,response,created_at').order('created_at', { ascending: true }),
    admin.from('saturday_dinner_signups').select('id,dinner_date,camper_id,lot_number,camper_name,attending_status,bringing,guest_count,created_at,updated_at').eq('dinner_date', thanksgivingDinnerDate).order('created_at', { ascending: true }),
    admin.from('campers').select('id,lot_number,first_name,last_name,active'),
  ])
  const error = eventResult.error || rsvpResult.error || dinnerResult.error || camperResult.error
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const events = eventResult.data || []
  const rsvps = rsvpResult.data || []
  const signups = dinnerResult.data || []
  const campers = new Map((camperResult.data || []).map((camper: any) => [String(camper.id), camper]))
  const eventCounts = communityEventCounts(events, rsvps, signups)
  const eventRows = events.map((event: any) => {
    const eventRsvps = rsvps.filter((rsvp: any) => String(rsvp.event_id) === String(event.id))
    return {
      id: event.id,
      title: event.title,
      date: event.event_date,
      thanksgiving: isThanksgivingCommunityEvent(event),
      displayedCounts: eventCounts[String(event.id)],
      regularRsvpCount: eventRsvps.length,
      regularRsvps: eventRsvps.map((rsvp: any) => {
        const camper: any = campers.get(String(rsvp.camper_id))
        return {
          id: rsvp.id,
          response: rsvp.response,
          camperId: rsvp.camper_id,
          lot: camper?.lot_number || null,
          name: camper ? `${camper.first_name || ''} ${camper.last_name || ''}`.trim() : 'Unknown camper',
          active: camper?.active ?? null,
        }
      }),
    }
  })

  const duplicateDates = Object.entries(events.reduce((groups: Record<string, any[]>, event: any) => {
    const key = String(event.event_date || '')
    groups[key] = [...(groups[key] || []), { id: event.id, title: event.title }]
    return groups
  }, {})).filter(([, rows]) => rows.length > 1).map(([date, rows]) => ({ date, events: rows }))

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    thanksgivingDinnerDate,
    eventRows,
    thanksgivingSignups: signups,
    duplicateDates,
  }, { headers: { 'Cache-Control': 'no-store' } })
}
