'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function CalendarPage() {
  const [events, setEvents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadEvents() {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .order('event_date', { ascending: true })

      if (error) {
        console.error(error)
      } else {
        setEvents(data || [])
      }

      setLoading(false)
    }

    loadEvents()
  }, [])

  if (loading) {
    return <p style={{ padding: '40px' }}>Loading events...</p>
  }

  return (
    <main style={{ padding: '40px', fontFamily: 'Arial' }}>
      <h1>Campground Events</h1>

      {events.length === 0 && <p>No upcoming events yet.</p>}

      {events.map((event) => (
        <div
          key={event.id}
          style={{
            border: '1px solid #ccc',
            padding: '20px',
            borderRadius: '10px',
            marginBottom: '20px',
            maxWidth: '700px',
          }}
        >
          <h2>{event.title}</h2>

          <p>
            <strong>Date:</strong> {event.event_date}
          </p>

          <p>{event.description}</p>
        </div>
      ))}
    </main>
  )
}