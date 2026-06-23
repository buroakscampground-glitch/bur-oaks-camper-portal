'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '../../../lib/supabase'
import { MaintenanceBadge } from '../../../components/MaintenanceBadge'

export default function MaintenanceDashboard() {
  const [loading, setLoading] = useState(true)
  const [tickets, setTickets] = useState<any[]>([])

  const [newTitle, setNewTitle] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newPriority, setNewPriority] = useState('Normal')
  const [submitMessage, setSubmitMessage] = useState('')

  const [filter, setFilter] = useState('Active')

  useEffect(() => {
    loadTickets()

    const refresh = () => loadTickets()
    const timer = window.setInterval(refresh, 30000)
    window.addEventListener('focus', refresh)
    window.addEventListener('pageshow', refresh)

    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refresh)
      window.removeEventListener('pageshow', refresh)
    }
  }, [])

  async function loadTickets() {
    const { data } = await supabase
      .from('maintenance_tickets')
      .select('*')
      .eq('admin_approved', true)
      .order('created_at', { ascending: false })

    setTickets(data || [])
    setLoading(false)
  }

  async function createWorkOrder() {
    if (!newTitle || !newDescription) {
      alert('Please enter a title and description')
      return
    }

    const { data: ticket, error } = await supabase
      .from('maintenance_tickets')
      .insert({
        title: newTitle,
        description: newDescription,
        status: 'Open',
        priority: newPriority,
        assigned_to: 'Open',
        reported_by: 'Maintenance',
        lot_number: 'WORK ORDER',
        work_order: true,
        admin_approved: false,
      })
      .select('id')
      .single()

    if (error) {
      alert(error.message)
      return
    }

    let alertMessage = ''
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token

    if (token && ticket?.id) {
      const alertResponse = await fetch('/api/admin-alert', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'maintenance_request',
          ticketId: ticket.id,
        }),
      })
      const alertResult = await alertResponse.json().catch(() => null)
      if (!alertResponse.ok || alertResult?.emailStatus === 'failed') {
        alertMessage = ` Ticket was saved, but the admin email alert did not send: ${alertResult?.emailMessage || alertResult?.error || 'unknown email error'}.`
      } else if (alertResult?.emailStatus === 'skipped') {
        alertMessage = ` Ticket was saved, but email alerts are not configured: ${alertResult.emailMessage || 'missing setup'}.`
      }
    }

    setNewTitle('')
    setNewDescription('')
    setNewPriority('Normal')
    setSubmitMessage(`Submitted for admin approval. It will appear in the work queue after approval.${alertMessage}`)

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

  const filteredTickets = tickets.filter((ticket) => {
    if (filter === 'Completed') {
      return ticket.status === 'Completed'
    }

    if (filter === 'All') {
      return true
    }

    return ticket.status !== 'Completed'
  })

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
            Submit issues for review, then work only from the admin-approved queue.
          </p>

          <div className="maintenance-approval-notice">
            <strong>Admin approval required</strong>
            <span>New requests cannot be assigned, started, or completed until an administrator approves the work.</span>
          </div>

          <Link href="/maintenance/history">
            View Maintenance History →
          </Link>
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

        <section
          className="card"
          style={{ marginBottom: '25px' }}
        >
          <h2>➕ Submit Work Request</h2>

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
            Submit for Admin Approval
          </button>

          {submitMessage && <p className="maintenance-submit-message">{submitMessage}</p>}
        </section>

        <section className="card">
          <h2>Approved Work Orders</h2>

          <div
            style={{
              display: 'flex',
              gap: '10px',
              marginBottom: '20px',
            }}
          >
            <button onClick={() => setFilter('Active')}>
              Active
            </button>

            <button onClick={() => setFilter('Completed')}>
              Completed
            </button>

            <button onClick={() => setFilter('All')}>
              All
            </button>
          </div>

          {filteredTickets.length === 0 && (
            <p>No maintenance tickets found.</p>
          )}

          {filteredTickets.map((ticket) => (
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

              <div>
                <Link
                  href={`/maintenance/dashboard/${ticket.id}`}
                  style={{
                    textDecoration: 'none',
                    color: '#2f5d3a',
                    fontWeight: 'bold',
                    fontSize: '18px',
                  }}
                >
                  {ticket.title}
                </Link>
              </div>

              <div
                style={{
                  marginTop: '8px',
                  color: '#555',
                }}
              >
                {ticket.description}
              </div>

              <div>
                Status:{' '}
                <MaintenanceBadge kind="status" value={ticket.status} />
              </div>

              <div>
                Priority:{' '}
                <MaintenanceBadge kind="priority" value={ticket.priority} />
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
                        assigned_to:
                          'Maintenance Staff',
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
                        completed_at: null,
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
