'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
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
  const [goingUnits, setGoingUnits] = useState<Record<string, string>>({})
  const [message, setMessage] = useState('')
  const router = useRouter()
  const pathname = usePathname()
  const homePath = pathname.startsWith('/community') ? '/community' : '/admin'

  useEffect(() => {
    loadEvents()
  }, [])

  async function loadEvents() {
    const { data: { session } } = await supabase.auth.getSession()
    const response = await fetch('/api/community-events', { headers: { Authorization: `Bearer ${session?.access_token || ''}` } })
    const result = await response.json().catch(() => ({}))
    if (!response.ok) {
      setMessage(result.error || 'Unable to load events.')
      return
    }
    const eventList = result.events || []

    setEvents(eventList)

    const today = new Date().toISOString().split('T')[0]

    setTotalEvents(eventList.length)

    setUpcomingEvents(
      eventList.filter(
        (event: any) => event.event_date >= today
      ).length
    )

    setPastEvents(
      eventList.filter(
        (event: any) => event.event_date < today
      ).length
    )

    const eventCounts = result.eventCounts || {}
    const counts: any = {}
    const going: any = {}
    const units: Record<string, string> = {}
    eventList.forEach((event: any) => {
      counts[event.id] = Number(eventCounts[event.id]?.rsvps || 0)
      going[event.id] = Number(eventCounts[event.id]?.going || 0)
      units[event.id] = String(eventCounts[event.id]?.goingUnit || 'campsites')
    })

    setTotalRsvps(Object.values(counts).reduce((total: number, count) => total + Number(count || 0), 0))

    setRsvpCounts(counts)
    setGoingCounts(going)
    setGoingUnits(units)
  }

  async function createEvent() {
    if (!title || !eventDate) {
      setMessage('Please add an event title and date.')
      return
    }

    const { data: { session } } = await supabase.auth.getSession()
    const response = await fetch('/api/community-events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
      body: JSON.stringify({ title, eventDate, description }),
    })
    const result = await response.json().catch(() => ({}))
    if (!response.ok) {
      setMessage(result.error || 'Unable to create this event.')
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

    const { data: { session } } = await supabase.auth.getSession()
    const response = await fetch('/api/community-events', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
      body: JSON.stringify({ id }),
    })
    if (!response.ok) {
      const result = await response.json().catch(() => ({}))
      setMessage(result.error || 'Unable to delete this event.')
      return
    }

    loadEvents()
  }

  return (
    <main className="page">
      <div className="container">

        <a
          href={homePath}
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
  onClick={() => router.push(homePath)}
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
              className="admin-event-list-card"
            >
              <p className="muted">
                {event.event_date}
              </p>

              <h3>{event.title}</h3>

              <p>{event.description}</p>

              <div className="admin-event-counts" aria-label="Event response totals">
                <div>
                  <span>RSVPs</span>
                  <strong>{rsvpCounts[event.id] || 0}</strong>
                </div>

                <div>
                  <span>{goingUnits[event.id] === 'people' ? 'Going (people)' : 'Going'}</span>
                  <strong>{goingCounts[event.id] || 0}</strong>
                </div>
              </div>

              <button
                type="button"
                className="admin-event-delete"
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
