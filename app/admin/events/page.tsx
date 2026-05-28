'use client'

import { useState } from 'react'
import { supabase } from '../../../lib/supabase'

export default function AdminEventsPage() {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [message, setMessage] = useState('')

  async function createEvent() {
    const { error } = await supabase.from('events').insert({
      title,
      description,
      event_date: eventDate,
    })

    if (error) {
      setMessage(error.message)
    } else {
      setMessage('Event created successfully!')
      setTitle('')
      setDescription('')
      setEventDate('')
    }
  }

  return (
    <main style={{ padding: '40px', fontFamily: 'Arial', maxWidth: '700px' }}>
      <h1>Admin - Create Event</h1>

      <label>Event Title</label>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Mouse Races"
        style={{
          display: 'block',
          padding: '10px',
          width: '100%',
          marginBottom: '15px',
        }}
      />

      <label>Description</label>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Join us in the Rec Hall for Mouse Races!"
        style={{
          display: 'block',
          padding: '10px',
          width: '100%',
          marginBottom: '15px',
          minHeight: '120px',
        }}
      />

      <label>Event Date</label>
      <input
        type="date"
        value={eventDate}
        onChange={(e) => setEventDate(e.target.value)}
        style={{
          display: 'block',
          padding: '10px',
          width: '100%',
          marginBottom: '15px',
        }}
      />

      <button
        onClick={createEvent}
        style={{
          padding: '12px 20px',
          background: 'black',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
        }}
      >
        Create Event
      </button>

      {message && <p style={{ marginTop: '20px' }}>{message}</p>}
    </main>
  )
}