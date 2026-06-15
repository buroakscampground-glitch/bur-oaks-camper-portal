'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '../../../../lib/supabase'

export default function MaintenanceTicketPage() {
  const params = useParams()

  const [ticket, setTicket] = useState<any>(null)
  const [loading, setLoading] = useState(true)
const [completionNotes, setCompletionNotes] = useState('')
  useEffect(() => {
    loadTicket()
  }, [])

  async function loadTicket() {
    const { data, error } = await supabase
      .from('maintenance_tickets')
      .select('*')
      .eq('id', params.id)
      .single()

    if (!error) {
      setTicket(data)
    }
setCompletionNotes(data.completion_notes || '')
    setLoading(false)
  }
async function saveNotes() {
  await supabase
    .from('maintenance_tickets')
    .update({
      completion_notes: completionNotes
    })
    .eq('id', ticket.id)

  alert('Notes Saved')
}
async function closeTicket() {
  await supabase
    .from('maintenance_tickets')
    .update({
      completion_notes: completionNotes,
      status: 'Completed'
    })
    .eq('id', ticket.id)

  alert('Ticket Closed')

  window.location.reload()
}
function printWorkOrder() {
  window.print()
}
  if (loading) {
    return (
      <main className="page">
        <div className="container">
          Loading...
        </div>
      </main>
    )
  }

  if (!ticket) {
    return (
      <main className="page">
        <div className="container">
          Ticket not found.
        </div>
      </main>
    )
  }

  return (
    <main className="page">
      <div className="container">

        <a
          href="/admin/maintenance"
          style={{
            display: 'inline-block',
            marginBottom: '20px',
            textDecoration: 'none',
            fontWeight: 'bold',
          }}
        >
          ← Back to Maintenance
        </a>

        <section className="card">

          <h1>{ticket.title}</h1>

          <p><strong>Status:</strong> {ticket.status}</p>
          <p><strong>Priority:</strong> {ticket.priority}</p>
          <p><strong>Assigned To:</strong> {ticket.assigned_to || 'Unassigned'}</p>
          <p><strong>Category:</strong> {ticket.category}</p>
          <p><strong>Lot Number:</strong> {ticket.lot_number || 'N/A'}</p>
          <p><strong>Reported By:</strong> {ticket.reported_by || 'N/A'}</p>

          <hr style={{ margin: '20px 0' }} />

          <h3>Description</h3>

          <p>{ticket.description}</p>

          <hr style={{ margin: '20px 0' }} />

          <h3>Completion Notes</h3>

<textarea
  value={completionNotes}
  onChange={(e) => setCompletionNotes(e.target.value)}
  rows={6}
  style={{
    width: '100%',
    padding: '10px',
    border: '1px solid #ccc',
    borderRadius: '6px',
    marginBottom: '15px'
  }}
/>

<div
  style={{
    display: 'flex',
    gap: '10px',
    flexWrap: 'wrap'
  }}
>
  <button
    onClick={saveNotes}
    className="btn"
  >
    Save Notes
  </button>

  <button
    onClick={printWorkOrder}
    className="btn"
  >
    Print Work Order
  </button>
  <button
  onClick={closeTicket}
  className="btn"
>
  Close Ticket
</button>
</div>

        </section>

      </div>
    </main>
  )
}