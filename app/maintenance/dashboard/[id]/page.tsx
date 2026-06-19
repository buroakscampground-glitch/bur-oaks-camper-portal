'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '../../../../lib/supabase'

export default function TicketDetailPage() {
  const params = useParams()
  const router = useRouter()

  const [ticket, setTicket] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadTicket()
  }, [])

  async function loadTicket() {
    const { data } = await supabase
      .from('maintenance_tickets')
      .select('*')
      .eq('id', params.id)
      .single()

    setTicket(data)
    setLoading(false)
  }

  if (loading) {
    return <div style={{ padding: '40px' }}>Loading...</div>
  }

  if (!ticket) {
    return <div style={{ padding: '40px' }}>Ticket not found</div>
  }

  return (
    <main className="page">
      <div className="container">
        <button
          onClick={() =>
            router.push('/maintenance/dashboard')
          }
          style={{
            marginBottom: '20px',
          }}
        >
          ← Back
        </button>

        <section className="card">
          <h1>{ticket.title}</h1>

          <p>
            <strong>Lot:</strong> {ticket.lot_number}
          </p>

          <p>
            <strong>Reported By:</strong> {ticket.reported_by}
          </p>

          <p>
            <strong>Status:</strong> {ticket.status}
          </p>

          <p>
            <strong>Priority:</strong> {ticket.priority || 'Normal'}
          </p>

          <p>
            <strong>Assigned To:</strong> {ticket.assigned_to || 'Open'}
          </p>

          <hr />

          <h3>Description</h3>

          <p>{ticket.description}</p>

          {ticket.completion_notes && (
            <>
              <hr />
              <h3>Completion Notes</h3>
              <p>{ticket.completion_notes}</p>
            </>
          )}

          {ticket.completed_at && (
            <p>
              <strong>Completed:</strong>{' '}
              {new Date(ticket.completed_at).toLocaleString()}
            </p>
          )}
        </section>
      </div>
    </main>
  )
}