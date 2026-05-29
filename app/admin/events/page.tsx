'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'

export default function AdminEventsPage() {
  const [events, setEvents] = useState<any[]>([])
  const [title, setTitle] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [description, setDescription] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    loadEvents()
  }, [])

  async function loadEvents() {
    const { data } = await supabase
      .from('events')
      .select('*')
      .order('event_date', { ascending: true })

    setEvents(data || [])
  }

  async function createEvent() {
    if (!title || !eventDate) {
      setMessage('Please add an event title and date.')
      return
    }

    const { error } = await supabase.from('events').insert({
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

    await supabase.from('events').delete().eq('id', id)
    loadEvents()
  }

  return (
    <main className="page">
      <div className="container">
        <section className="card" style={{ marginBottom: '25px' }}>
          <p className="muted">BUR OAKS CAMPGROUND</p>
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