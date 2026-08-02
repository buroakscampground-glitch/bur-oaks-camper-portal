'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarDays, CheckCircle2, Download, MapPin, PartyPopper, UsersRound } from 'lucide-react'
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
  const router = useRouter()

  useEffect(() => {
    loadCalendar()
  }, [])

  async function loadCalendar() {
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      window.location.href = '/login'
      return
    }

    const camperData = await getCurrentCamper()

    setCamper(camperData)

    const { data: eventData } = await supabase
      .from('events')
      .select('*')
      .order('event_date', { ascending: true })

    const { data: rsvpData } = await supabase
      .from('event_rsvps')
      .select('*')

    setEvents(eventData || [])
    setRsvps(rsvpData || [])
    setLoading(false)
  }

  async function saveRsvp(eventId: string, response: string) {
    if (!camper) return

    await supabase
      .from('event_rsvps')
      .delete()
      .eq('event_id', eventId)
      .eq('camper_id', camper.id)

    await supabase.from('event_rsvps').insert({
      event_id: eventId,
      camper_id: camper.id,
      response,
    })

    if (response === 'Going') {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token

      if (token) {
        fetch('/api/admin-alert', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            type: 'event_rsvp',
            eventId,
            response,
          }),
        }).catch((alertError) => console.error('RSVP alert failed:', alertError))
      }
    }

    loadCalendar()
  }

  if (loading) return <p style={{ padding: '40px' }}>Loading events...</p>

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
                    <button className={myRsvp?.response === 'Going' ? 'active' : ''} onClick={() => saveRsvp(event.id, 'Going')}>Going</button>
                    <button className={myRsvp?.response === 'Maybe' ? 'active' : ''} onClick={() => saveRsvp(event.id, 'Maybe')}>Maybe</button>
                    <button className={myRsvp?.response === 'Not Going' ? 'active muted' : ''} onClick={() => saveRsvp(event.id, 'Not Going')}>Not Going</button>
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
