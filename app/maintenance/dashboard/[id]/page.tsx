'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '../../../../lib/supabase'
import { MaintenanceBadge } from '../../../../components/MaintenanceBadge'
import MaintenancePhotos from '../../../../components/MaintenancePhotos'

export default function TicketDetailPage() {
  const params = useParams()
  const router = useRouter()

  const [ticket, setTicket] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  const [status, setStatus] = useState('')
  const [assignedTo, setAssignedTo] = useState('')

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
    setAssignedTo(data?.assigned_to || 'Open')

    setLoading(false)
  }

  async function saveChanges() {
    const updates: any = {
      status,
      assigned_to: assignedTo,
    }

    if (status === 'Completed' && !ticket.completed_at) {
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
            <MaintenanceBadge kind="status" value={ticket.status} />{' '}
            <MaintenanceBadge kind="priority" value={ticket.priority} />
          </p>

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
          </div>

          <div style={{ marginBottom: '20px' }}>
            <strong>Assigned To</strong>

            <select
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value)}
              style={{
                display: 'block',
                marginTop: '8px',
                padding: '10px',
                width: '250px',
              }}
            >
              <option>Open</option>
              <option>Anthony Finley</option>
              <option>Dawn Finley</option>
              <option>Charlie Kimball</option>
              <option>Rachel Finley</option>
              <option>Joe Johnson</option>
            </select>
          </div>

          <button
            onClick={saveChanges}
            style={{
              marginBottom: '20px',
            }}
          >
            Save Changes
          </button>

          <p>
            <strong>Priority:</strong>{' '}
            <MaintenanceBadge kind="priority" value={ticket.priority} />
          </p>

          <hr />

          <h3>Description</h3>

          <p>{ticket.description}</p>

          <MaintenancePhotos paths={ticket.photo_urls} />

          {ticket.completion_notes && (
            <>
              <hr />
              <h3>Completion Notes</h3>
              <p>{ticket.completion_notes}</p>
            </>
          )}

          {ticket.completed_at && (
            <>
              <hr />
              <p>
                <strong>Completed:</strong>{' '}
                {new Date(ticket.completed_at).toLocaleString()}
              </p>
            </>
          )}
        </section>
      </div>
    </main>
  )
}
