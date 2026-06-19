'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '../../../../lib/supabase'

export default function TicketDetailPage() {
  const params = useParams()
  const router = useRouter()

  const [ticket, setTicket] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('')

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
    setStatus(data?.status || 'Open')
    setLoading(false)
  }

  async function saveChanges() {
    const updates: any = {
      status,
    }

    if (status === 'Completed') {
      updates.completed_at = new Date().toISOString()
    }

    await supabase
      .from('maintenance_tickets')
      .update(updates)
      .eq('id', params.id)

    alert('Changes Saved')

    loadTicket()
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

          <div style={{ marginBottom: '20px' }}>
            <strong>Status</strong>

            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              style={{
                display: 'block',
                marginTop: '8px',
                padding: '10px',
                width: '250px',
              }}
            >
              <option>Open</option>
              <option>In Progress</option>
              <option>Waiting Parts</option>
              <option>Completed</option>
            </select>

            <button
              onClick={saveChanges}
              style={{
                marginTop: '10px',
              }}
            >
              Save Changes
            </button>
          </div>

          <p>
            <strong>Priority:</strong>{' '}
            {ticket.priority || 'Normal'}
          </p>

          <p>
            <strong>Assigned To:</strong>{' '}
            {ticket.assigned_to || 'Open'}
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