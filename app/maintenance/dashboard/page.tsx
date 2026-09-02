'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, CheckCircle2, ClipboardList, Clock3, Eye, Gauge, ListChecks, PackageCheck, PlusCircle, Warehouse, Wrench } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { MaintenanceBadge } from '../../../components/MaintenanceBadge'
import MaintenanceSupplyRequestPanel from '../../../components/MaintenanceSupplyRequestPanel'
import { maintenanceTaskForDisplay } from '../../../lib/maintenance-ticket-display'

const weeklyTasks = [
  {
    id: 'trash',
    title: 'Take all trash out',
    detail: 'Empty campground trash, check problem areas, and report overflow or dumping.',
  },
  {
    id: 'showerhouse',
    title: 'Clean shower house',
    detail: 'Clean floors, sinks, toilets, showers, restock supplies, and report repairs needed.',
  },
  {
    id: 'grounds-limbs',
    title: 'Inspect grounds for downed limbs',
    detail: 'Drive/walk common areas and roads. Submit a request for anything needing office review.',
  },
  {
    id: 'mowers',
    title: 'Service mowers',
    detail: 'Check fuel, oil, blades, belts, tire pressure, and note any parts or repairs needed.',
  },
]

function getMaintenanceWeekKey() {
  const now = new Date()
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  start.setDate(now.getDate() - now.getDay())
  return start.toISOString().slice(0, 10)
}

export default function MaintenanceDashboard() {
  const [loading, setLoading] = useState(true)
  const [tickets, setTickets] = useState<any[]>([])
  const [weeklyDone, setWeeklyDone] = useState<Record<string, boolean>>({})

  const [newTitle, setNewTitle] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newPriority, setNewPriority] = useState('Normal')
  const [submitMessage, setSubmitMessage] = useState('')

  useEffect(() => {
    loadTickets()
    const key = `bur-oaks-maintenance-weekly-${getMaintenanceWeekKey()}`

    try {
      setWeeklyDone(JSON.parse(window.localStorage.getItem(key) || '{}'))
    } catch {
      setWeeklyDone({})
    }

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

  function toggleWeeklyTask(id: string) {
    const key = `bur-oaks-maintenance-weekly-${getMaintenanceWeekKey()}`
    const next = { ...weeklyDone, [id]: !weeklyDone[id] }

    setWeeklyDone(next)
    window.localStorage.setItem(key, JSON.stringify(next))
  }

  async function loadTickets() {
    const { data } = await supabase
      .from('maintenance_tickets')
      .select('*')
      .eq('admin_approved', true)
      .neq('status', 'Completed')
      .order('created_at', { ascending: false })

    setTickets(data || [])
    setLoading(false)
  }

  async function createWorkOrder() {
    if (!newTitle || !newDescription) {
      alert('Please enter a title and description')
      return
    }

    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token

    if (!token) {
      setSubmitMessage('Please sign out and back in before submitting a work request.')
      return
    }

    setSubmitMessage('Submitting for admin approval…')

    const response = await fetch('/api/maintenance-staff-request', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: newTitle,
        description: newDescription,
        priority: newPriority,
      }),
    })

    const result = await response.json().catch(() => null)

    if (!response.ok || !result?.success) {
      setSubmitMessage(result?.error || 'Unable to submit this work request. Please try again.')
      return
    }

    let alertMessage = ''
    if (result.emailStatus === 'failed') {
      alertMessage = ` Ticket was saved, but the admin email alert did not send: ${result.emailMessage || 'unknown email error'}.`
    } else if (result.emailStatus === 'skipped') {
      alertMessage = ` Ticket was saved, but email alerts are not configured: ${result.emailMessage || 'missing setup'}.`
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
        <div className="maintenance-staff-hero-links">
          <Link className="maintenance-meter-link" href="/maintenance/dashboard/meter-readings"><Gauge size={16} /> Read Electric Meters</Link>
          <Link href="/maintenance/dashboard/inventory"><Warehouse size={16} /> Supply inventory</Link>
          <Link href="/maintenance/history">Completed history →</Link>
        </div>
      </section>

      <section className="maintenance-staff-steps">
        <article><ClipboardList size={20} /><strong>1. Pick approved work</strong><span>Open a ticket from the queue below.</span></article>
        <article><Clock3 size={20} /><strong>2. Update progress</strong><span>Mark in progress or waiting parts as you work.</span></article>
        <article><CheckCircle2 size={20} /><strong>3. Parts, receipts, notes</strong><span>Open details to record parts used, receipt photos, and what was done.</span></article>
      </section>

      <section className="maintenance-weekly-card">
        <div className="maintenance-weekly-heading">
          <div>
            <span><ListChecks size={17} /> WEEKLY GROUNDS ROUTINE</span>
            <h2>This week’s recurring tasks</h2>
            <p>Tap each task as it is done. If you find a repair, hazard, or part needed, submit it below for office approval.</p>
          </div>
          <strong>{weeklyTasks.filter((task) => weeklyDone[task.id]).length}/{weeklyTasks.length} done</strong>
        </div>

        <div className="maintenance-weekly-grid">
          {weeklyTasks.map((task) => (
            <button
              type="button"
              key={task.id}
              className={weeklyDone[task.id] ? 'done' : ''}
              onClick={() => toggleWeeklyTask(task.id)}
            >
              <span>{weeklyDone[task.id] ? <CheckCircle2 size={18} /> : <Clock3 size={18} />}</span>
              <strong>{task.title}</strong>
              <small>{task.detail}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="maintenance-staff-stats">
        <article><small>Open</small><strong>{openTickets}</strong></article>
        <article><small>In progress</small><strong>{inProgressTickets}</strong></article>
        <article className={emergencyTickets ? 'urgent' : ''}><small>Emergency</small><strong>{emergencyTickets}</strong></article>
      </section>

      <MaintenanceSupplyRequestPanel />

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
          <Link href="/maintenance/history">Open completed archive →</Link>
        </div>

          {tickets.length === 0 && (
            <div className="maintenance-staff-empty">
              <CheckCircle2 size={32} />
              <h3>No work orders found</h3>
              <p>Nothing in this view right now.</p>
            </div>
          )}

        <div className="maintenance-staff-ticket-list">
          {tickets.map((ticket) => (
            <article
              key={ticket.id}
              className={ticket.priority === 'Emergency' && ticket.status !== 'Completed' ? 'urgent' : ''}
            >
              <div>
                <span className="maintenance-ticket-lot">LOT {ticket.lot_number || 'N/A'}</span>
                <h3>{ticket.title}</h3>
                <p>{maintenanceTaskForDisplay(ticket)}</p>
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
                <Link className="record-supplies" href={`/maintenance/dashboard/${ticket.id}#work-order-supplies`}>
                  <PackageCheck size={15} /> Record supplies used
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
