'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../../lib/supabase'
import { MaintenanceBadge } from '../../../components/MaintenanceBadge'

export default function MaintenancePage() {
  const [tickets, setTickets] = useState<any[]>([])
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('General')
  const [priority, setPriority] = useState('Normal')
  const [assignedTo, setAssignedTo] = useState('')
  const [lotNumber, setLotNumber] = useState('')
  const [reportedBy, setReportedBy] = useState('')
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const router = useRouter()

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

    const { error } = await supabase
      .from('maintenance_tickets')
      .insert({
        title,
        description,
        category,
        priority,
        assigned_to: assignedTo,
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
    setPriority('Normal')
    setAssignedTo('')
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

  const emergencyCount =
    tickets.filter((t) => t.priority === 'Emergency').length

  return (
    <main className="page">
      <div className="container">

        <a
          href="/admin"
          style={{
            display: 'inline-block',
            marginBottom: '20px',
            textDecoration: 'none',
            fontWeight: 'bold',
          }}
        >
          ← Back to Dashboard
        </a>

        <section className="card" style={{ marginBottom: '25px' }}>
          <p className="muted">BUR OAKS CAMPGROUND</p>
          <button
  onClick={() => router.push('/admin')}
  style={{
    marginBottom: '20px',
    background: '#6b7280',
    color: 'white',
    border: 'none',
    padding: '10px 16px',
    borderRadius: '8px',
    cursor: 'pointer',
  }}
>
  ← Back to Dashboard
</button>
          <h1>Maintenance Tickets</h1>
          <p className="muted">
            Track campground issues, repairs, and work orders.
          </p>

          <a
            href="/maintenance/history"
            style={{ display: 'inline-block', marginBottom: '20px' }}
          >
            View Maintenance History →
          </a>

          <input
            placeholder="Ticket Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={{
              display: 'block',
              width: '100%',
              marginBottom: '12px',
            }}
          />

          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            style={{
              display: 'block',
              width: '100%',
              marginBottom: '12px',
            }}
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

          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            style={{
              display: 'block',
              width: '100%',
              marginBottom: '12px',
            }}
          >
            <option>Low</option>
            <option>Normal</option>
            <option>High</option>
            <option>Emergency</option>
          </select>

          <select
            value={assignedTo}
            onChange={(e) => setAssignedTo(e.target.value)}
            style={{
              display: 'block',
              width: '100%',
              marginBottom: '12px',
            }}
          >
            <option value="">Assign To</option>
            <option>Anthony</option>
            <option>Rachel</option>
            <option>Joe Johnson</option>
            <option>Vendor</option>
            <option>Electrician</option>
            <option>Plumber</option>
          </select>

          <input
            placeholder="Lot Number"
            value={lotNumber}
            onChange={(e) => setLotNumber(e.target.value)}
            style={{
              display: 'block',
              width: '100%',
              marginBottom: '12px',
            }}
          />

          <input
            placeholder="Reported By"
            value={reportedBy}
            onChange={(e) => setReportedBy(e.target.value)}
            style={{
              display: 'block',
              width: '100%',
              marginBottom: '12px',
            }}
          />

          <textarea
            placeholder="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            style={{
              display: 'block',
              width: '100%',
              minHeight: '110px',
              marginBottom: '12px',
            }}
          />

          <button onClick={createTicket}>
            Create Ticket
          </button>

          {message && <p>{message}</p>}
        </section>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 1fr)',
            gap: '15px',
            marginBottom: '20px',
          }}
        >
          <div className="card">
            <h3>Open</h3>
            <h1>{tickets.filter(t => t.status === 'Open').length}</h1>
          </div>

          <div className="card">
            <h3>In Progress</h3>
            <h1>{tickets.filter(t => t.status === 'In Progress').length}</h1>
          </div>

          <div className="card">
            <h3>Completed</h3>
            <h1>{tickets.filter(t => t.status === 'Completed').length}</h1>
          </div>

          <div className="card">
            <h3>Emergency</h3>
            <h1>{emergencyCount}</h1>
          </div>

          <div className="card">
            <h3>Total</h3>
            <h1>{tickets.length}</h1>
          </div>
        </div>

        <section className="card">
          <h2>Current Tickets</h2>

          <div
            style={{
              display: 'flex',
              gap: '10px',
              marginBottom: '20px',
              flexWrap: 'wrap',
            }}
          >
            <input
              placeholder="Search lot, camper, title..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ flex: 1 }}
            />

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option>All</option>
              <option>Open</option>
              <option>In Progress</option>
              <option>Completed</option>
            </select>
          </div>

          {tickets
            .filter((ticket) => {
              const matchesSearch =
                ticket.title?.toLowerCase().includes(search.toLowerCase()) ||
                ticket.lot_number?.toString().includes(search) ||
                ticket.reported_by?.toLowerCase().includes(search.toLowerCase())

              const matchesStatus =
                statusFilter === 'All' ||
                ticket.status === statusFilter

              return matchesSearch && matchesStatus
            })
            .map((ticket) => (
              <div
                key={ticket.id}
                style={{
                  borderTop: '1px solid #e3ded2',
                  padding: '15px 0',
                }}
              >
                <p className="muted">{ticket.created_at}</p>

                <h3>{ticket.title}</h3>

                <p><strong>Category:</strong> {ticket.category}</p>

                <p>
                  <strong>Priority:</strong>{' '}
                  <MaintenanceBadge kind="priority" value={ticket.priority} />
                </p>

                <p>
                  <strong>Assigned To:</strong>{' '}
                  {ticket.assigned_to || 'Unassigned'}
                </p>

                <p>
                  <strong>Status:</strong>{' '}
                  <MaintenanceBadge kind="status" value={ticket.status} />
                </p>
                <p><strong>Lot:</strong> {ticket.lot_number || 'N/A'}</p>
                <p><strong>Reported By:</strong> {ticket.reported_by || 'N/A'}</p>
                <p>{ticket.description}</p>

                <div
                  style={{
                    display: 'flex',
                    gap: '10px',
                    flexWrap: 'wrap',
                  }}
                >
                  <button onClick={() => updateStatus(ticket.id, 'Open')}>
                    Open
                  </button>

                  <button onClick={() => updateStatus(ticket.id, 'In Progress')}>
                    In Progress
                  </button>

                  <button onClick={() => updateStatus(ticket.id, 'Completed')}>
                    Completed
                  </button>
<a href={`/admin/maintenance/${ticket.id}`}>
  <button>
    View Ticket
  </button>
</a>
                  <button onClick={() => deleteTicket(ticket.id)}>
                    Delete
                  </button>
                </div>
              </div>
            ))}
        </section>
      </div>
    </main>
  )
}
