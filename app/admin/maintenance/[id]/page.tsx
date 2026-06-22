'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '../../../../lib/supabase'
import { MaintenanceBadge } from '../../../../components/MaintenanceBadge'
import MaintenancePhotos from '../../../../components/MaintenancePhotos'

export default function MaintenanceTicketPage() {
  const params = useParams()

  const [ticket, setTicket] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  const [completionNotes, setCompletionNotes] = useState('')
  const [status, setStatus] = useState('')
  const [assignedTo, setAssignedTo] = useState('')

  useEffect(() => {
    loadTicket()
  }, [])

  async function loadTicket() {
    const { data, error } = await supabase
      .from('maintenance_tickets')
      .select('*')
      .eq('id', params.id)
      .single()

    if (!error && data) {
      setTicket(data)
      setCompletionNotes(data.completion_notes || '')
      setStatus(data.status || 'Open')
      setAssignedTo(data.assigned_to || 'Open')
    }

    setLoading(false)
  }

  async function saveTicket() {
    const updates: any = {
      status,
      assigned_to: assignedTo,
      completion_notes: completionNotes,
    }

    if (
      status === 'Completed' &&
      !ticket.completed_at
    ) {
      updates.completed_at =
        new Date().toISOString()
    }

    await supabase
      .from('maintenance_tickets')
      .update(updates)
      .eq('id', ticket.id)

    alert('Ticket Updated')

    loadTicket()
  }

  async function closeTicket() {
    await supabase
      .from('maintenance_tickets')
      .update({
        status: 'Completed',
        completion_notes: completionNotes,
        completed_at:
          new Date().toISOString(),
      })
      .eq('id', ticket.id)

    alert('Ticket Closed')

    loadTicket()
  }

  async function setApproval(approved: boolean) {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    const { error } = await supabase
      .from('maintenance_tickets')
      .update({
        admin_approved: approved,
        approved_at: approved ? new Date().toISOString() : null,
        approved_by: approved ? user?.email || 'Admin' : null,
        ...(approved ? {} : { status: 'Open', assigned_to: 'Open' }),
      })
      .eq('id', ticket.id)

    if (error) {
      alert(error.message)
      return
    }

    alert(approved ? 'Work Order Approved' : 'Approval Removed')
    loadTicket()
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

          <div className={`maintenance-admin-approval ${ticket.admin_approved ? 'approved' : 'pending'}`}>
            <div>
              <strong>{ticket.admin_approved ? 'Approved for Maintenance Work' : 'Admin Approval Required'}</strong>
              <span>
                {ticket.admin_approved
                  ? `Approved${ticket.approved_by ? ` by ${ticket.approved_by}` : ''}. Maintenance may now update this work order.`
                  : 'Maintenance can see and act on this request only after approval.'}
              </span>
            </div>
            <button type="button" onClick={() => setApproval(!ticket.admin_approved)}>
              {ticket.admin_approved ? 'Remove Approval' : 'Approve Work'}
            </button>
          </div>

          <p>
            <MaintenanceBadge kind="status" value={ticket.status} />{' '}
            <MaintenanceBadge kind="priority" value={ticket.priority} />
          </p>

          <div style={{ marginBottom: '15px' }}>
            <strong>Status</strong>

            <select
              value={status}
              onChange={(e) =>
                setStatus(e.target.value)
              }
              style={{
                width: '100%',
                marginTop: '8px',
              }}
            >
              <option>Open</option>
              <option>In Progress</option>
              <option>Waiting Parts</option>
              <option>Completed</option>
            </select>
          </div>

          <div style={{ marginBottom: '15px' }}>
            <strong>Assigned To</strong>

            <select
              value={assignedTo}
              onChange={(e) =>
                setAssignedTo(e.target.value)
              }
              style={{
                width: '100%',
                marginTop: '8px',
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

          <p>
            <strong>Priority:</strong>{' '}
            <MaintenanceBadge kind="priority" value={ticket.priority} />
          </p>

          <p>
            <strong>Category:</strong>{' '}
            {ticket.category}
          </p>

          <p>
            <strong>Lot Number:</strong>{' '}
            {ticket.lot_number || 'N/A'}
          </p>

          <p>
            <strong>Reported By:</strong>{' '}
            {ticket.reported_by || 'N/A'}
          </p>

          <hr style={{ margin: '20px 0' }} />

          <h3>Description</h3>

          <p>{ticket.description}</p>

          <MaintenancePhotos paths={ticket.photo_urls} />

          <hr style={{ margin: '20px 0' }} />

          <h3>Completion Notes</h3>

          <textarea
            value={completionNotes}
            onChange={(e) =>
              setCompletionNotes(
                e.target.value
              )
            }
            rows={6}
            style={{
              width: '100%',
              padding: '10px',
              border: '1px solid #ccc',
              borderRadius: '6px',
              marginBottom: '15px',
            }}
          />

          {ticket.completed_at && (
            <p>
              <strong>Completed:</strong>{' '}
              {new Date(
                ticket.completed_at
              ).toLocaleString()}
            </p>
          )}

          <div
            style={{
              display: 'flex',
              gap: '10px',
              flexWrap: 'wrap',
            }}
          >
            <button onClick={saveTicket}>
              Save Ticket
            </button>

            <button onClick={printWorkOrder}>
              Print Work Order
            </button>

            <button onClick={closeTicket}>
              Close Ticket
            </button>
          </div>
        </section>
      </div>
    </main>
  )
}
