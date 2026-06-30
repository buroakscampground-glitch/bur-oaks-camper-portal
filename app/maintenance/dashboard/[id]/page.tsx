'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, CheckCircle2, ClipboardList, Save, Wrench } from 'lucide-react'
import { supabase } from '../../../../lib/supabase'
import { MaintenanceBadge } from '../../../../components/MaintenanceBadge'
import MaintenancePhotos from '../../../../components/MaintenancePhotos'
import MaintenanceConversation from '../../../../components/MaintenanceConversation'

export default function TicketDetailPage() {
  const params = useParams()
  const router = useRouter()

  const [ticket, setTicket] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  const [status, setStatus] = useState('')
  const [assignedTo, setAssignedTo] = useState('')
  const [completionNotes, setCompletionNotes] = useState('')
  const [message, setMessage] = useState('')

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
    setCompletionNotes(data?.completion_notes || '')

    setLoading(false)
  }

  async function saveChanges() {
    const updates: any = {
      status,
      assigned_to: assignedTo,
      completion_notes: completionNotes.trim() || null,
    }

    if (status === 'Completed' && !ticket.completed_at) {
      updates.completed_at = new Date().toISOString()
    }

    if (status !== 'Completed') {
      updates.completed_at = null
    }

    const { data, error } = await supabase
      .from('maintenance_tickets')
      .update(updates)
      .eq('id', params.id)
      .select('*')
      .single()

    if (error) {
      setMessage(error.message)
      return
    }

    setTicket(data)
    setStatus(data?.status || 'Open')
    setAssignedTo(data?.assigned_to || 'Open')
    setCompletionNotes(data?.completion_notes || '')
    setMessage('Saved. Admin and camper views will update automatically.')
  }

  if (loading) {
    return <div style={{ padding: '40px' }}>Loading...</div>
  }

  if (!ticket) {
    return <div style={{ padding: '40px' }}>Ticket not found</div>
  }

  return (
    <main className="maintenance-staff-page">
      <section className="maintenance-staff-detail-hero">
        <button type="button" onClick={() => router.push('/maintenance/dashboard')}>
          <ArrowLeft size={16} /> Back to work orders
        </button>
        <span><Wrench size={17} /> APPROVED WORK ORDER</span>
        <h1>{ticket.title}</h1>
        <p>{ticket.work_order ? 'Office-created work order' : `Lot ${ticket.lot_number || 'N/A'} request`} · Update progress here so the office and camper stay in sync.</p>
      </section>

          <div className="maintenance-approved-work-notice">
            <strong>✓ Admin Approved Work Order</strong>
            <span>
              Approved{ticket.approved_by ? ` by ${ticket.approved_by}` : ''}
              {ticket.approved_at ? ` on ${new Date(ticket.approved_at).toLocaleDateString()}` : ''}.
            </span>
          </div>

      <section className="maintenance-staff-detail-grid">
        <article className="maintenance-staff-detail-card">
          <div className="maintenance-staff-detail-heading">
            <ClipboardList size={20} />
            <div>
              <small>REQUEST DETAILS</small>
              <h2>What needs done</h2>
            </div>
          </div>
          <div className="maintenance-staff-badges">
            <MaintenanceBadge kind="status" value={ticket.status} />
            <MaintenanceBadge kind="priority" value={ticket.priority} />
          </div>
          <dl className="maintenance-staff-detail-list">
            <div><dt>Lot</dt><dd>{ticket.lot_number || 'N/A'}</dd></div>
            <div><dt>Reported by</dt><dd>{ticket.reported_by || 'Office'}</dd></div>
            <div><dt>Assigned to</dt><dd>{ticket.assigned_to || 'Open'}</dd></div>
          </dl>
          <h3>Description</h3>
          <p>{ticket.description}</p>
          <MaintenancePhotos paths={ticket.photo_urls} />
        </article>

        <article className="maintenance-staff-detail-card">
          <div className="maintenance-staff-detail-heading">
            <CheckCircle2 size={20} />
            <div>
              <small>UPDATE WORK</small>
              <h2>Progress</h2>
            </div>
          </div>

          <label className="maintenance-staff-field">
            <span>Status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option>Open</option>
              <option>In Progress</option>
              <option>Waiting Parts</option>
              <option>Completed</option>
            </select>
          </label>

          <label className="maintenance-staff-field">
            <span>Assigned To</span>
            <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
              <option>Open</option>
              <option>Anthony Finley</option>
              <option>Dawn Finley</option>
              <option>Charlie Kimball</option>
              <option>Rachel Finley</option>
              <option>Joe Johnson</option>
              <option>Maintenance Staff</option>
            </select>
          </label>

          <label className="maintenance-staff-field">
            <span>Completion / progress notes</span>
            <textarea
              value={completionNotes}
              onChange={(e) => setCompletionNotes(e.target.value)}
              placeholder="Example: Replaced breaker, cleaned area, waiting on part, completed repair..."
            />
          </label>

          <button className="maintenance-staff-save" onClick={saveChanges}>
            <Save size={16} /> Save update
          </button>

          {message && <p className="maintenance-submit-message">{message}</p>}

          {ticket.completed_at && (
            <p className="maintenance-staff-completed">
              Completed: {new Date(ticket.completed_at).toLocaleString()}
            </p>
          )}
        </article>
      </section>

      <section className="maintenance-staff-detail-card maintenance-staff-notes-card">
        <div className="maintenance-staff-detail-heading">
          <ClipboardList size={20} />
          <div>
            <small>NOTES</small>
            <h2>Work order conversation</h2>
          </div>
        </div>
        <MaintenanceConversation
          ticketId={ticket.id}
          camperId={ticket.camper_id}
          authorName="Maintenance Staff"
          authorRole="maintenance"
        />
      </section>
    </main>
  )
}
