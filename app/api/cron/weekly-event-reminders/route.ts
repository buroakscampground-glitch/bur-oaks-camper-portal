import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { centralDate } from '../../../../lib/camper-celebrations'
import { eventFlyers2026 } from '../../../../lib/event-flyers'
import { addCentralDays, daysUntilEvent, sendEventReminder } from '../../../../lib/event-reminders'
import { isOperationalCamper } from '../../../../lib/camper-records'

export const dynamic = 'force-dynamic'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mzywctpxnpejglnspyqi.supabase.co'

function adminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  return key ? createClient(supabaseUrl, key) : null
}

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET
  return Boolean(secret && request.headers.get('authorization') === `Bearer ${secret}`)
}

function eventKey(title: unknown, date: unknown) {
  return `${String(date || '').trim()}::${String(title || '').trim().toLowerCase()}`
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  const admin = adminClient()
  if (!admin) return NextResponse.json({ error: 'Supabase service key is not configured.' }, { status: 500 })

  const today = centralDate()
  const isWednesday = new Date(Date.UTC(today.year, today.month - 1, today.day)).getUTCDay() === 3
  const through = isWednesday ? addCentralDays(today, 14) : today.iso
  const [{ data: events, error: eventError }, { data: campers, error: camperError }] = await Promise.all([
    admin
      .from('events')
      .select('id,title,event_date,description')
      .gte('event_date', today.iso)
      .lte('event_date', through)
      .order('event_date', { ascending: true }),
    admin
      .from('campers')
      .select('id,first_name,last_name,email,secondary_email,phone,alternate_phone,second_profile_phone,sms_opt_in,active,role,lot_number')
      .eq('active', true)
      .eq('sms_opt_in', true),
  ])

  if (eventError || camperError) {
    return NextResponse.json({ error: eventError?.message || camperError?.message }, { status: 500 })
  }

  const databaseEvents = events || []
  const mergedEvents: Array<{ id: string; title: string; event_date: string; description: string | null }> = databaseEvents.map((event) => ({
    id: String(event.id),
    title: event.title,
    event_date: event.event_date,
    description: event.description,
  }))
  const knownEvents = new Set(mergedEvents.map((event) => eventKey(event.title, event.event_date)))

  for (const flyer of eventFlyers2026) {
    if (flyer.date < today.iso || flyer.date > through || knownEvents.has(eventKey(flyer.title, flyer.date))) continue
    mergedEvents.push({
      id: `flyer:${flyer.slug}`,
      title: flyer.title,
      event_date: flyer.date,
      description: flyer.description,
    })
  }
  mergedEvents.sort((a, b) => a.event_date.localeCompare(b.event_date) || a.title.localeCompare(b.title))

  const eligibleCampers = (campers || []).filter(isOperationalCamper)
  const eventIds = databaseEvents.map((event) => event.id)
  const { data: rsvps, error: rsvpError } = eventIds.length
    ? await admin.from('event_rsvps').select('event_id,camper_id,response').in('event_id', eventIds)
    : { data: [], error: null }

  if (rsvpError) return NextResponse.json({ error: rsvpError.message }, { status: 500 })

  const notGoing = new Set(
    (rsvps || [])
      .filter((rsvp) => rsvp.response === 'Not Going')
      .map((rsvp) => `${String(rsvp.event_id)}:${String(rsvp.camper_id)}`)
  )
  const summary = {
    success: true,
    reminderDate: today.iso,
    through,
    reminderMode: isWednesday ? 'Wednesday look-ahead' : 'event day only',
    events: mergedEvents.length,
    campers: eligibleCampers.length,
    skippedNotGoing: 0,
    deliveries: 0,
    emailSent: 0,
    smsSent: 0,
    failed: 0,
    eventResults: [] as Array<Record<string, unknown>>,
  }

  for (const event of mergedEvents) {
    const days = daysUntilEvent(event.event_date, today)
    if (days === null || days < 0 || days > 14) continue
    const eventSummary = { eventId: event.id, title: event.title, date: event.event_date, days, campers: 0, emailSent: 0, smsSent: 0, failed: 0 }

    const eventCampers = eligibleCampers.filter((camper) => {
      if (!notGoing.has(`${String(event.id)}:${String(camper.id)}`)) return true
      summary.skippedNotGoing += 1
      return false
    })

    for (let index = 0; index < eventCampers.length; index += 5) {
      const batch = eventCampers.slice(index, index + 5)
      const results = await Promise.all(
        batch.map((camper) => sendEventReminder({ client: admin, camper, event, today, days }))
      )

      for (const result of results) {
        eventSummary.campers += 1
        summary.deliveries += 1
        if (result.email === 'sent') {
          summary.emailSent += 1
          eventSummary.emailSent += 1
        }
        if (result.sms === 'sent') {
          summary.smsSent += 1
          eventSummary.smsSent += 1
        }
        if (result.email === 'failed' || result.sms === 'failed') {
          summary.failed += 1
          eventSummary.failed += 1
        }
      }
    }

    summary.eventResults.push(eventSummary)
  }

  return NextResponse.json(summary)
}
