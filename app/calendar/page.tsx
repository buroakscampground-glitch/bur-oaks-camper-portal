'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'

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

    const { data: camperData } = await supabase
      .from('campers')
      .select('*')
      .eq('email', user.email)
      .single()

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

    loadCalendar()
  }

  if (loading) return <p style={{ padding: '40px' }}>Loading events...</p>

  return (
    <main className="page">
      <div className="container">
        <section className="card" style={{ marginBottom: '25px' }}>
          <p className="muted">BUR OAKS CAMPGROUND</p>
          <button
  onClick={() => router.push('/portal')}
  style={{
    marginBottom: '20px',
    background: '#6b7280',
    color: 'white',
    border: 'none',
    padding: '10px 16px',
    borderRadius: '8px',
    cursor: 'pointer',
  }}
>
  ← Back to Portal
</button>
          <h1>📅 Events Calendar</h1>
<h2 style={{ color: '#2f5d3a' }}>
  {events.length} Upcoming Events
</h2>
<p className="muted">
  RSVP for upcoming campground events.
</p>
        </section>

        <div className="grid">
          {events.map((event) => {
            const eventRsvps = rsvps.filter((r) => r.event_id === event.id)
            const myRsvp = eventRsvps.find((r) => r.camper_id === camper?.id)

            const goingCount = eventRsvps.filter((r) => r.response === 'Going').length
            const maybeCount = eventRsvps.filter((r) => r.response === 'Maybe').length

            return (
              <section className="card" key={event.id}>
                <p
  className="muted"
  style={{
    fontWeight: 'bold',
    color: '#2f5d3a',
  }}
>
  📅 {event.event_date}
</p>
                <h2>{event.title}</h2>
                <p>{event.description}</p>

{event.location && (
  <p className="muted">
    📍 {event.location}
  </p>
)}

                <p className="muted">
                ✅ Going: {goingCount}
&nbsp;&nbsp;•&nbsp;&nbsp;
🤔 Maybe: {maybeCount}
                </p>

                {myRsvp && (
                  <p>
                 Your RSVP: <strong>
  {myRsvp.response === 'Going'
    ? '✅ Going'
    : myRsvp.response === 'Maybe'
    ? '🤔 Maybe'
    : '❌ Not Going'}
</strong>
                  </p>
                )}

                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <button onClick={() => saveRsvp(event.id, 'Going')}>Going</button>
                  <button onClick={() => saveRsvp(event.id, 'Maybe')}>Maybe</button>
                  <button onClick={() => saveRsvp(event.id, 'Not Going')}>Not Going</button>
                </div>
              </section>
            )
          })}

          {events.length === 0 && (
            <section className="card">
              <h2>No events yet</h2>
              <p className="muted">There are no upcoming campground events posted right now.</p>
            </section>
          )}
        </div>
      </div>
    </main>
  )
}