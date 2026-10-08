'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, CalendarDays, CheckCircle2, Download, Loader2, MapPin, PartyPopper, UsersRound } from 'lucide-react'
import { getCurrentCamper, supabase } from '../../lib/supabase'
import EventFlyerShowcase from '../../components/EventFlyerShowcase'

function googleCalendarUrl(event: any) {
  const eventDate = event.event_date || new Date().toISOString().split('T')[0]
  const start = eventDate.replaceAll('-', '')
  const endDate = new Date(`${eventDate}T12:00:00`)
  endDate.setDate(endDate.getDate() + 1)
  const end = endDate.toISOString().slice(0, 10).replaceAll('-', '')
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title || 'Bur Oaks Event',
    dates: `${start}/${end}`,
    details: event.description || '',
    location: event.location || 'Bur Oaks Campground',
  })

  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

export default function CalendarPage() {
  const [events, setEvents] = useState<any[]>([])
  const [camper, setCamper] = useState<any>(null)
  const [rsvps, setRsvps] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [savingEventId, setSavingEventId] = useState('')
  const [message, setMessage] = useState('')
  const router = useRouter()

  useEffect(() => {
    loadCalendar()
  }, [])

  async function loadCalendar() {
    setLoading(true)
    setLoadError('')
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError) throw authError

      if (!user) {
        window.location.href = '/login'
        return
      }

      const { error: camperAvailabilityError } = await supabase.from('campers').select('id').limit(1)
      if (camperAvailabilityError) throw camperAvailabilityError
      const camperData = await getCurrentCamper()
      if (!camperData) throw new Error('Your camper account could not be found.')

      const [eventResult, rsvpResult] = await Promise.all([
        supabase.from('events').select('*').order('event_date', { ascending: true }),
        supabase.from('event_rsvps').select('*'),
      ])

      if (eventResult.error || rsvpResult.error) throw eventResult.error || rsvpResult.error
      setCamper(camperData)
      setEvents(eventResult.data || [])
      setRsvps(Array.from(new Map((rsvpResult.data || []).map((item) => [`${item.event_id}:${item.camper_id}`, item])).values()))
    } catch (error: any) {
      setEvents([])
      setRsvps([])
      setLoadError(error?.message || 'The event calendar could not be loaded.')
    } finally {
      setLoading(false)
    }
  }

  async function saveRsvp(eventId: string, response: string) {
    if (!camper || savingEventId) return
    setSavingEventId(eventId)
    setMessage('Saving your event response…')
    try {
      const { data: existing, error: existingError } = await supabase
        .from('event_rsvps')
        .select('id')
        .eq('event_id', eventId)
        .eq('camper_id', camper.id)
        .limit(1)
        .maybeSingle()
      if (existingError) throw existingError

      const result = existing?.id
        ? await supabase.from('event_rsvps').update({ response }).eq('id', existing.id)
        : await supabase.from('event_rsvps').insert({ event_id: eventId, camper_id: camper.id, response })
      if (result.error) throw result.error

      setRsvps((current) => [
        ...current.filter((item) => !(item.event_id === eventId && item.camper_id === camper.id)),
        { ...(existing || {}), event_id: eventId, camper_id: camper.id, response },
      ])
      setMessage(`Saved — ${response}.`)
    } catch {
      setMessage('The RSVP result could not be confirmed. Check this event before choosing again.')
    } finally {
      setSavingEventId('')
    }
  }

  if (loading) return <main className="portal-loading" role="alert"><Loader2 className="portal-loading-spinner" aria-hidden="true" /><h1>Loading campground events…</h1></main>
  if (loadError) return <main className="portal-loading portal-loading-error" role="alert"><AlertTriangle aria-hidden="true" /><h1>Calendar is temporarily unavailable</h1><p>Events, RSVP totals, and response controls are hidden until the complete calendar can be confirmed.</p><button className="portal-loading-retry" type="button" onClick={loadCalendar}>Try again</button></main>

  const upcomingEvents = events.filter((event) => {
    const today = new Date().toISOString().split('T')[0]
    return !event.event_date || event.event_date >= today
  })
  const featuredEvent = upcomingEvents[0] || events[0]

  return (
    <main className="camper-events-page">
      <section className="camper-events-hero">
        <button type="button" onClick={() => router.push('/portal')}>← Back to Portal</button>
        <span><PartyPopper size={17} /> Campground calendar</span>
        <h1>Good weekends start here.</h1>
        <p>See what is happening around Bur Oaks, RSVP for events, and help the office plan for the right crowd.</p>
        {featuredEvent && (
          <div className="camper-featured-event">
            <small>FEATURED NEXT</small>
            <strong>{featuredEvent.title}</strong>
            <span><CalendarDays size={15} /> {featuredEvent.event_date || 'Date coming soon'}</span>
          </div>
        )}
      </section>

      <div className="camper-events-shell">
        <EventFlyerShowcase context="portal" limit={6} />
        {message && <p className="portal-refresh-notice" role="status">{message}</p>}

        <section className="camper-event-rsvp-guide" aria-label="How event RSVPs work">
          <CheckCircle2 size={22} />
          <div>
            <small>HOW EVENT RSVPs WORK</small>
            <h2>One response is for the overall event.</h2>
            <p>
              Choose Going if anyone from your campsite plans to attend the listed event or weekend. You do not
              need to text the office separately for each activity or food item unless the flyer specifically asks
              for another sign-up, ticket, or preorder. Saturday Dinner meal counts are handled separately in
              <a href="/dinners"> Saturday Dinners</a>.
            </p>
          </div>
        </section>

        <section className="camper-events-overview">
          <article><CalendarDays size={20} /><span><small>Upcoming</small><strong>{upcomingEvents.length}</strong></span></article>
          <article><UsersRound size={20} /><span><small>Your RSVPs</small><strong>{rsvps.length}</strong></span></article>
          <article><CheckCircle2 size={20} /><span><small>You are going</small><strong>{rsvps.filter((r) => r.response === 'Going').length}</strong></span></article>
        </section>

        <div className="camper-event-grid">
          {events.map((event) => {
            const eventRsvps = rsvps.filter((r) => r.event_id === event.id)
            const myRsvp = eventRsvps.find((r) => r.camper_id === camper?.id)

            return (
              <section className="camper-event-card" key={event.id}>
                <div className="camper-event-art">
                  <CalendarDays size={32} />
                  <span>{event.event_date ? new Date(`${event.event_date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Soon'}</span>
                </div>
                <div className="camper-event-copy">
                  <small>BUR OAKS EVENT</small>
                  <h2>{event.title}</h2>
                  <p>{event.description || 'More details will be shared soon.'}</p>

                  <p className="camper-event-rsvp-scope">
                    <strong>RSVP scope:</strong> Your response is for this overall event, not each individual flyer item.
                  </p>

                  {event.location && (
                    <p className="camper-event-location">
                      <MapPin size={15} /> {event.location}
                    </p>
                  )}

                  {myRsvp && (
                    <div className="camper-event-rsvp-status">
                      Your RSVP: <strong>
                        {myRsvp.response === 'Going'
                          ? '✅ Going'
                          : myRsvp.response === 'Maybe'
                            ? '🤔 Maybe'
                            : '❌ Not Going'}
                      </strong>
                    </div>
                  )}

                  <div className="camper-event-actions">
                    <button disabled={Boolean(savingEventId)} className={myRsvp?.response === 'Going' ? 'active' : ''} onClick={() => saveRsvp(event.id, 'Going')}>Going</button>
                    <button disabled={Boolean(savingEventId)} className={myRsvp?.response === 'Maybe' ? 'active' : ''} onClick={() => saveRsvp(event.id, 'Maybe')}>Maybe</button>
                    <button disabled={Boolean(savingEventId)} className={myRsvp?.response === 'Not Going' ? 'active muted' : ''} onClick={() => saveRsvp(event.id, 'Not Going')}>Not Going</button>
                    <a className="camper-event-calendar-link" href={googleCalendarUrl(event)} rel="noreferrer" target="_blank">
                      <Download size={15} /> Add to calendar
                    </a>
                  </div>
                </div>
              </section>
            )
          })}

          {events.length === 0 && (
            <section className="camper-event-empty">
              <h2>No events yet</h2>
              <p>There are no upcoming campground events posted right now.</p>
            </section>
          )}
        </div>
      </div>
    </main>
  )
}
