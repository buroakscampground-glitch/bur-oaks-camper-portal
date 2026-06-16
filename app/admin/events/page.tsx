'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../../lib/supabase'

export default function AdminEventsPage() {
  const [events, setEvents] = useState<any[]>([])
  const [title, setTitle] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [description, setDescription] = useState('')
  const [totalEvents, setTotalEvents] = useState(0)
  const [upcomingEvents, setUpcomingEvents] = useState(0)
  const [pastEvents, setPastEvents] = useState(0)
  const [totalRsvps, setTotalRsvps] = useState(0)
  const [rsvpCounts, setRsvpCounts] = useState<any>({})
  const [goingCounts, setGoingCounts] = useState<any>({})
  const [message, setMessage] = useState('')
  const router = useRouter()

  useEffect(() => {
    loadEvents()
  }, [])

  async function loadEvents() {
    const { data } = await supabase
      .from('events')
      .select('*')
      .order('event_date', { ascending: true })

    const eventList = data || []

    setEvents(eventList)

    const today = new Date().toISOString().split('T')[0]

    setTotalEvents(eventList.length)

    setUpcomingEvents(
      eventList.filter(
        (event) => event.event_date >= today
      ).length
    )

    setPastEvents(
      eventList.filter(
        (event) => event.event_date < today
      ).length
    )

    const { count } = await supabase
      .from('event_rsvps')
      .select('*', { count: 'exact', head: true })

    setTotalRsvps(count || 0)

    const { data: rsvps } = await supabase
      .from('event_rsvps')
      .select('event_id,response')

    const counts: any = {}
    const going: any = {}

    rsvps?.forEach((rsvp: any) => {
      counts[rsvp.event_id] =
        (counts[rsvp.event_id] || 0) + 1

      if (rsvp.response === 'Going') {
        going[rsvp.event_id] =
          (going[rsvp.event_id] || 0) + 1
      }
    })

    setRsvpCounts(counts)
    setGoingCounts(going)
  }

  async function createEvent() {
    if (!title || !eventDate) {
      setMessage('Please add an event title and date.')
      return
    }

    const { error } = await supabase
      .from('events')
      .insert({
        title,
        event_date: eventDate,
        description,
      })

    if (error) {
      setMessage(error.message)
      return
    }

    setTitle('')
    setEventDate('')
    setDescription('')
    setMessage('Event created!')

    loadEvents()
  }

  async function deleteEvent(id: string) {
    const ok = confirm('Delete this event?')
    if (!ok) return

    await supabase
      .from('events')
      .delete()
      .eq('id', id)

    loadEvents()
  }

  return (
    <main className="page">
      <div className="container">

        <a
          href="/admin"
          style={{
            display: 'inline-block',
            marginBottom: '20px',
            textDecoration: 'none',
            fontWeight: 'bold',
          }}
        >
          ← Back to Dashboard
        </a>

        <section
          className="card"
          style={{ marginBottom: '25px' }}
        >
          <p className="muted">
            BUR OAKS CAMPGROUND
          </p>
<button
  onClick={() => router.push('/admin')}
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
  ← Back to Dashboard
</button>
          <h1>Manage Events</h1>

          <p className="muted">
            Create and manage campground events for the camper calendar.
          </p>

          <input
            placeholder="Event Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={{
              display: 'block',
              width: '100%',
              marginBottom: '12px',
            }}
          />

          <input
            type="date"
            value={eventDate}
            onChange={(e) => setEventDate(e.target.value)}
            style={{
              display: 'block',
              width: '100%',
              marginBottom: '12px',
            }}
          />

          <textarea
            placeholder="Event Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            style={{
              display: 'block',
              width: '100%',
              minHeight: '110px',
              marginBottom: '12px',
            }}
          />

          <button onClick={createEvent}>
            Create Event
          </button>

          {message && <p>{message}</p>}
        </section>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns:
              'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '15px',
            marginBottom: '20px',
          }}
        >
          <div className="card">
            <h3>Total Events</h3>
            <h1>{totalEvents}</h1>
          </div>

          <div className="card">
            <h3>Upcoming Events</h3>
            <h1>{upcomingEvents}</h1>
          </div>

          <div className="card">
            <h3>Past Events</h3>
            <h1>{pastEvents}</h1>
          </div>

          <div className="card">
            <h3>Total RSVPs</h3>
            <h1>{totalRsvps}</h1>
          </div>
        </div>

        <section className="card">
          <h2>Current Events</h2>

          {events.length === 0 && (
            <p className="muted">
              No events created yet.
            </p>
          )}

          {events.map((event) => (
            <div
              key={event.id}
              style={{
                borderTop: '1px solid #e3ded2',
                padding: '15px 0',
              }}
            >
              <p className="muted">
                {event.event_date}
              </p>

              <h3>{event.title}</h3>

              <p>{event.description}</p>

              <div
                style={{
                  marginTop: '10px',
                  fontWeight: 'bold',
                }}
              >
                <p>
                  RSVPs: {rsvpCounts[event.id] || 0}
                </p>

                <p>
                  Going: {goingCounts[event.id] || 0}
                </p>
              </div>

              <button
                onClick={() => deleteEvent(event.id)}
              >
                Delete
              </button>
            </div>
          ))}
        </section>

      </div>
    </main>
  )
}