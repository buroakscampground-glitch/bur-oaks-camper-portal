'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'

export default function AdminRsvpsPage() {
  const [events, setEvents] = useState<any[]>([])
  const [rsvps, setRsvps] = useState<any[]>([])
  const [campers, setCampers] = useState<any[]>([])

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    const { data: eventData } = await supabase
      .from('events')
      .select('*')
      .order('event_date', { ascending: true })

    const { data: rsvpData } = await supabase
      .from('event_rsvps')
      .select('*')

    const { data: camperData } = await supabase
      .from('campers')
      .select('*')

    setEvents(eventData || [])
    setRsvps(rsvpData || [])
    setCampers(camperData || [])
  }

  function getCamperName(camperId: string) {
    const camper = campers.find((c) => c.id === camperId)
    if (!camper) return 'Unknown Camper'
    return `Lot ${camper.lot_number} - ${camper.first_name} ${camper.last_name}`
  }

  return (
    <main className="page">
      <div className="container">
        <section className="card" style={{ marginBottom: '25px' }}>
          <p className="muted">BUR OAKS CAMPGROUND</p>
          <h1>Event RSVPs</h1>
          <button
  onClick={() => window.history.back()}
  style={{
    marginTop: '10px',
    marginBottom: '15px',
    padding: '10px 16px',
    borderRadius: '8px',
    border: 'none',
    background: '#2f5d3a',
    color: 'white',
    cursor: 'pointer',
    fontWeight: 'bold',
  }}
>
  ← Back
</button>
          <p className="muted">See who is attending each campground event.</p>
        </section>

        <div className="grid">
          {events.map((event) => {
            const eventRsvps = rsvps.filter((r) => r.event_id === event.id)
            const going = eventRsvps.filter((r) => r.response === 'Going')
            const maybe = eventRsvps.filter((r) => r.response === 'Maybe')
            const notGoing = eventRsvps.filter((r) => r.response === 'Not Going')

            return (
              <section className="card" key={event.id}>
                <p className="muted">{event.event_date}</p>
                <h2>{event.title}</h2>

                <p>
                  <strong>Going:</strong> {going.length} &nbsp; | &nbsp;
                  <strong>Maybe:</strong> {maybe.length} &nbsp; | &nbsp;
                  <strong>Not Going:</strong> {notGoing.length}
                </p>

                <h3>Going</h3>
                {going.length === 0 && <p className="muted">No one yet.</p>}
                {going.map((r) => (
                  <p key={r.id}>{getCamperName(r.camper_id)}</p>
                ))}

                <h3>Maybe</h3>
                {maybe.length === 0 && <p className="muted">No one yet.</p>}
                {maybe.map((r) => (
                  <p key={r.id}>{getCamperName(r.camper_id)}</p>
                ))}

                <h3>Not Going</h3>
                {notGoing.length === 0 && <p className="muted">No one yet.</p>}
                {notGoing.map((r) => (
                  <p key={r.id}>{getCamperName(r.camper_id)}</p>
                ))}
              </section>
            )
          })}
        </div>
      </div>
    </main>
  )
}