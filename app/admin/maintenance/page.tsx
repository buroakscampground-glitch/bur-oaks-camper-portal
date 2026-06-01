'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'

export default function MaintenancePage() {
  const [tickets, setTickets] = useState<any[]>([])
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('General')
  const [lotNumber, setLotNumber] = useState('')
  const [reportedBy, setReportedBy] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    loadTickets()
  }, [])

  async function loadTickets() {
    const { data } = await supabase
      .from('maintenance_tickets')
      .select('*')
      .order('created_at', { ascending: false })

    setTickets(data || [])
  }

  async function createTicket() {
    if (!title) {
      setMessage('Please add a ticket title.')
      return
    }

    const { error } = await supabase.from('maintenance_tickets').insert({
      title,
      description,
      category,
      lot_number: lotNumber,
      reported_by: reportedBy,
      status: 'Open',
    })

    if (error) {
      setMessage(error.message)
      return
    }

    setTitle('')
    setDescription('')
    setCategory('General')
    setLotNumber('')
    setReportedBy('')
    setMessage('Maintenance ticket created!')
    loadTickets()
  }

  async function updateStatus(id: string, status: string) {
    const { error } = await supabase
      .from('maintenance_tickets')
      .update({ status })
      .eq('id', id)

    if (error) {
      setMessage(error.message)
      return
    }

    setMessage('Ticket updated.')
    loadTickets()
  }

  async function deleteTicket(id: string) {
    const ok = confirm('Delete this maintenance ticket?')
    if (!ok) return

    const { error } = await supabase
      .from('maintenance_tickets')
      .delete()
      .eq('id', id)

    if (error) {
      setMessage(error.message)
      return
    }

    setMessage('Ticket deleted.')
    loadTickets()
  }

  return (
    <main className="page">
      <div className="container">
        <section className="card" style={{ marginBottom: '25px' }}>
          <p className="muted">BUR OAKS CAMPGROUND</p>
          <h1>Maintenance Tickets</h1>
          <p className="muted">Track campground issues, repairs, and work orders.</p>

          <input
            placeholder="Ticket Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={{ display: 'block', width: '100%', marginBottom: '12px' }}
          />

          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            style={{ display: 'block', width: '100%', marginBottom: '12px' }}
          >
            <option>General</option>
            <option>Electric</option>
            <option>Water</option>
            <option>Gate</option>
            <option>Roads</option>
            <option>Rec Hall</option>
            <option>Bathroom</option>
            <option>Tree / Grounds</option>
          </select>

          <input
            placeholder="Lot Number"
            value={lotNumber}
            onChange={(e) => setLotNumber(e.target.value)}
            style={{ display: 'block', width: '100%', marginBottom: '12px' }}
          />

          <input
            placeholder="Reported By"
            value={reportedBy}
            onChange={(e) => setReportedBy(e.target.value)}
            style={{ display: 'block', width: '100%', marginBottom: '12px' }}
          />

          <textarea
            placeholder="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            style={{ display: 'block', width: '100%', minHeight: '110px', marginBottom: '12px' }}
          />

          <button onClick={createTicket}>Create Ticket</button>

          {message && <p>{message}</p>}
        </section>

        <section className="card">
          <h2>Current Tickets</h2>

          {tickets.length === 0 && <p className="muted">No maintenance tickets yet.</p>}

          {tickets.map((ticket) => (
            <div key={ticket.id} style={{ borderTop: '1px solid #e3ded2', padding: '15px 0' }}>
              <p className="muted">{ticket.created_at}</p>
              <h3>{ticket.title}</h3>
              <p><strong>Category:</strong> {ticket.category}</p>
              <p><strong>Status:</strong> {ticket.status}</p>
              <p><strong>Lot:</strong> {ticket.lot_number || 'N/A'}</p>
              <p><strong>Reported By:</strong> {ticket.reported_by || 'N/A'}</p>
              <p>{ticket.description}</p>

              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <button onClick={() => updateStatus(ticket.id, 'Open')}>Open</button>
                <button onClick={() => updateStatus(ticket.id, 'In Progress')}>In Progress</button>
                <button onClick={() => updateStatus(ticket.id, 'Completed')}>Completed</button>
                <button onClick={() => deleteTicket(ticket.id)}>Delete</button>
              </div>
            </div>
          ))}
        </section>
      </div>
    </main>
  )
}