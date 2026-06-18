'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'

export default function MaintenanceDashboard() {
  const [loading, setLoading] = useState(true)
  const [tickets, setTickets] = useState<any[]>([])

  useEffect(() => {
    loadTickets()
  }, [])

  async function loadTickets() {
    const { data } = await supabase
      .from('maintenance_tickets')
      .select('*')
      .order('created_at', { ascending: false })

    setTickets(data || [])
    setLoading(false)
  }

  const openTickets = tickets.filter(
    (t) => t.status === 'Open'
  ).length

  const inProgressTickets = tickets.filter(
    (t) => t.status === 'In Progress'
  ).length

  const emergencyTickets = tickets.filter(
    (t) => t.priority === 'Emergency'
  ).length

  if (loading) {
    return <div style={{ padding: '40px' }}>Loading...</div>
  }

  return (
    <main className="page">
      <div className="container">
        <section
          className="card"
          style={{
            marginBottom: '25px',
            background:
              'linear-gradient(135deg, #ffffff 0%, #eef4ea 100%)',
          }}
        >
          <p className="muted">BUR OAKS CAMPGROUND</p>

          <h1>🔧 Maintenance Dashboard</h1>

          <p className="muted">
            Maintenance Staff Access
          </p>
        </section>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns:
              'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '20px',
            marginBottom: '25px',
          }}
        >
          <div className="card">
            <h3>Open Tickets</h3>
            <h1>{openTickets}</h1>
          </div>

          <div className="card">
            <h3>In Progress</h3>
            <h1>{inProgressTickets}</h1>
          </div>

          <div className="card">
            <h3>Emergency</h3>
            <h1>{emergencyTickets}</h1>
          </div>
        </div>

        <section className="card">
          <h2>Maintenance Tickets</h2>

          {tickets.length === 0 && (
            <p>No maintenance tickets found.</p>
          )}

          {tickets.map((ticket) => (
            <div
              key={ticket.id}
              style={{
                padding: '15px',
                borderBottom: '1px solid #ddd',
              }}
            >
              <strong>
                Lot {ticket.lot_number}
              </strong>

              <div>{ticket.title}</div>

              <div>
                Status: {ticket.status}
              </div>

              <div>
                Priority:{' '}
                {ticket.priority || 'Normal'}
              </div>
            </div>
          ))}
        </section>
      </div>
    </main>
  )
}