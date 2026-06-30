'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, CheckCircle2, ClipboardList, Clock3, Eye, ListChecks, PlusCircle, Wrench } from 'lucide-react'
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

  async function updateTicket(id: string, updates: any, successMessage: string) {
    const { error } = await supabase
      .from('maintenance_tickets')
      .update(updates)
      .eq('id', id)

    setSubmitMessage(error ? error.message : successMessage)
    if (!error) loadTickets()
  }

  async function completeTicket(id: string) {
    const notes = prompt('Completion notes — what was done?')
    if (notes === null) return

    await updateTicket(
      id,
      {
        status: 'Completed',
        completion_notes: notes.trim() || 'Completed by maintenance team.',
        completed_at: new Date().toISOString(),
      },
      'Work order marked completed. The camper/admin side will update automatically.'
    )
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
    <main className="maintenance-staff-page">
      <section className="maintenance-staff-hero">
        <div>
          <span><Wrench size={17} /> MAINTENANCE TEAM</span>
          <h1>Approved work orders only.</h1>
          <p>Use this screen in the field. New items you enter go to the office first. Only approved work shows in your queue.</p>
        </div>
        <Link href="/maintenance/history">Completed history →</Link>
      </section>

      <section className="maintenance-staff-steps">
        <article><ClipboardList size={20} /><strong>1. Pick approved work</strong><span>Open a ticket from the queue below.</span></article>
        <article><Clock3 size={20} /><strong>2. Update progress</strong><span>Mark in progress or waiting parts as you work.</span></article>
        <article><CheckCircle2 size={20} /><strong>3. Complete with notes</strong><span>Add what was done before closing it.</span></article>
      </section>

      <section className="maintenance-staff-stats">
        <article><small>Open</small><strong>{openTickets}</strong></article>
        <article><small>In progress</small><strong>{inProgressTickets}</strong></article>
        <article className={emergencyTickets ? 'urgent' : ''}><small>Emergency</small><strong>{emergencyTickets}</strong></article>
      </section>

      <section className="maintenance-staff-request">
        <div>
          <span><PlusCircle size={16} /> Need office approval?</span>
          <h2>Submit a work request</h2>
          <p>This does not go into the crew queue until an admin approves it.</p>
        </div>

          <input
            placeholder="Short title — example: Gate keypad light out"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
          />

          <textarea
            placeholder="Describe what you saw, where it is, and anything the office should know."
            value={newDescription}
            onChange={(e) =>
              setNewDescription(e.target.value)
            }
          />

          <select
            value={newPriority}
            onChange={(e) =>
              setNewPriority(e.target.value)
            }
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

      <section className="maintenance-staff-board">
        <div className="maintenance-staff-board-heading">
          <div>
            <span><ListChecks size={17} /> APPROVED QUEUE</span>
            <h2>Work orders</h2>
            <p>Tap “Open details” when you need photos, notes, or the full request.</p>
          </div>
          <div className="maintenance-staff-filter">
            {['Active', 'Completed', 'All'].map((item) => (
              <button className={filter === item ? 'selected' : ''} onClick={() => setFilter(item)} key={item}>
                {item}
              </button>
            ))}
          </div>
        </div>

          {filteredTickets.length === 0 && (
            <div className="maintenance-staff-empty">
              <CheckCircle2 size={32} />
              <h3>No work orders found</h3>
              <p>Nothing in this view right now.</p>
            </div>
          )}

        <div className="maintenance-staff-ticket-list">
          {filteredTickets.map((ticket) => (
            <article
              key={ticket.id}
              className={ticket.priority === 'Emergency' && ticket.status !== 'Completed' ? 'urgent' : ''}
            >
              <div>
                <small>{ticket.work_order ? 'Work order' : `Lot ${ticket.lot_number || 'N/A'}`}</small>
                <h3>{ticket.title}</h3>
                <p>{ticket.description}</p>
              </div>

              <div className="maintenance-staff-badges">
                <MaintenanceBadge kind="status" value={ticket.status} />
                <MaintenanceBadge kind="priority" value={ticket.priority} />
                {ticket.priority === 'Emergency' && ticket.status !== 'Completed' && (
                  <span className="maintenance-staff-alert"><AlertTriangle size={13} /> Emergency</span>
                )}
              </div>

              <div className="maintenance-staff-ticket-actions">
                <Link href={`/maintenance/dashboard/${ticket.id}`}>
                  <Eye size={15} /> Open details
                </Link>
                <button
                  onClick={() => updateTicket(ticket.id, { assigned_to: 'Maintenance Staff' }, 'Assigned to maintenance staff.')}
                >
                  Assign To Me
                </button>

                <button
                  onClick={() => updateTicket(ticket.id, { status: 'In Progress', completed_at: null }, 'Work order marked in progress.')}
                >
                  Mark In Progress
                </button>

                <button
                  onClick={() => completeTicket(ticket.id)}
                >
                  Mark Completed
                </button>
              </div>

              {ticket.assigned_to && (
                <p className="maintenance-staff-assigned">Assigned to: {ticket.assigned_to}</p>
              )}

              {ticket.completion_notes && (
                <p className="maintenance-staff-notes">Notes: {ticket.completion_notes}</p>
              )}
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}
