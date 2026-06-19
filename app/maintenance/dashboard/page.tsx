'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'

export default function MaintenanceDashboard() {
  const [loading, setLoading] = useState(true)
  const [tickets, setTickets] = useState<any[]>([])
  const [newTitle, setNewTitle] = useState('')
const [newDescription, setNewDescription] = useState('')
const [newAssignedTo, setNewAssignedTo] = useState('Open')
const [newPriority, setNewPriority] = useState('Normal')

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
async function createWorkOrder() {
  if (!newTitle || !newDescription) {
    alert('Please enter a title and description')
    return
  }

  const { error } = await supabase
    .from('maintenance_tickets')
    .insert({
      title: newTitle,
      description: newDescription,
      status: 'Open',
      priority: newPriority,
      assigned_to: newAssignedTo,
      reported_by: 'Maintenance',
      lot_number: 'WORK ORDER',
      work_order: true,
    })

  if (error) {
    alert(error.message)
    return
  }

  setNewTitle('')
  setNewDescription('')
  setNewAssignedTo('Open')
  setNewPriority('Normal')

  loadTickets()
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
            <section
  className="card"
  style={{ marginBottom: '25px' }}
>
  <h2>➕ New Work Order</h2>

  <input
    placeholder="Work Order Title"
    value={newTitle}
    onChange={(e) => setNewTitle(e.target.value)}
    style={{
      width: '100%',
      marginBottom: '10px',
    }}
  />

  <textarea
    placeholder="Description"
    value={newDescription}
    onChange={(e) =>
      setNewDescription(e.target.value)
    }
    style={{
      width: '100%',
      minHeight: '100px',
      marginBottom: '10px',
    }}
  />

  <select
    value={newAssignedTo}
    onChange={(e) =>
      setNewAssignedTo(e.target.value)
    }
    style={{
      width: '100%',
      marginBottom: '10px',
    }}
  >
    <option>Open</option>
    <option>Anthony Finley</option>
    <option>Dawn Finley</option>
    <option>Charlie Kimball</option>
    <option>Rachel Finley</option>
    <option>Joe Johnson</option>
  </select>

  <select
    value={newPriority}
    onChange={(e) =>
      setNewPriority(e.target.value)
    }
    style={{
      width: '100%',
      marginBottom: '10px',
    }}
  >
    <option>Low</option>
    <option>Normal</option>
    <option>High</option>
    <option>Emergency</option>
  </select>

  <button onClick={createWorkOrder}>
    Create Work Order
  </button>
</section>
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
  Priority: {ticket.priority || 'Normal'}
</div>

<div
  style={{
    marginTop: '10px',
    display: 'flex',
    gap: '10px',
    flexWrap: 'wrap',
  }}
>
  <button
    onClick={async () => {
      await supabase
        .from('maintenance_tickets')
        .update({
          assigned_to: 'Maintenance Staff',
        })
        .eq('id', ticket.id)

      loadTickets()
    }}
  >
    Assign To Me
  </button>

  <button
    onClick={async () => {
      await supabase
        .from('maintenance_tickets')
        .update({
          status: 'In Progress',
        })
        .eq('id', ticket.id)

      loadTickets()
    }}
  >
    Mark In Progress
  </button>

  <button
    onClick={async () => {
      const notes = prompt(
        'Completion Notes'
      )

      await supabase
        .from('maintenance_tickets')
        .update({
          status: 'Completed',
          completion_notes: notes,
          completed_at:
            new Date().toISOString(),
        })
        .eq('id', ticket.id)

      loadTickets()
    }}
  >
    Mark Completed
  </button>
</div>

{ticket.assigned_to && (
  <div style={{ marginTop: '10px' }}>
    Assigned To: {ticket.assigned_to}
  </div>
)}

{ticket.completion_notes && (
  <div style={{ marginTop: '10px' }}>
    Notes: {ticket.completion_notes}
  </div>
)}
            </div>
          ))}
        </section>
      </div>
    </main>
  )
}