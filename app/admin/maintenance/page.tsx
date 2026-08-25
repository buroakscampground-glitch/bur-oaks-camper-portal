'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Archive,
  ArrowRight,
  ClipboardList,
  Hammer,
  Printer,
  Search,
  ShieldCheck,
  Trash2,
  Wrench,
} from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { MaintenanceBadge } from '../../../components/MaintenanceBadge'
import { markAdminAlertsSeen } from '../../../lib/admin-alert-actions'

const completedTicketStatuses = new Set(['completed', 'complete', 'closed', 'resolved', 'done'])

function isCompletedTicket(ticket: any) {
  return completedTicketStatuses.has(String(ticket?.status || '').trim().toLowerCase())
}

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
  const [archivedCount, setArchivedCount] = useState(0)
  const [creating, setCreating] = useState(false)
  const [sendingWorkOrders, setSendingWorkOrders] = useState(false)
  const router = useRouter()

  useEffect(() => {
    loadTickets()

    const reload = () => loadTickets()
    window.addEventListener('focus', reload)
    window.addEventListener('pageshow', reload)

    return () => {
      window.removeEventListener('focus', reload)
      window.removeEventListener('pageshow', reload)
    }
  }, [])

  async function loadTickets() {
    await markAdminAlertsSeen(supabase, 'maintenance_request')

    const { data } = await supabase
      .from('maintenance_tickets')
      .select('*')
      .order('created_at', { ascending: false })

    const allTickets = data || []
    setTickets(allTickets.filter((ticket) => !isCompletedTicket(ticket)))
    setArchivedCount(allTickets.filter(isCompletedTicket).length)
  }

  async function createTicket() {
    if (!title) {
      setMessage('Please add a ticket title.')
      return
    }

    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token

    if (!token) {
      setMessage('Please sign out and back in before creating a maintenance ticket.')
      return
    }

    setCreating(true)
    setMessage('Creating ticket and notifying maintenance…')

    try {
      const response = await fetch('/api/admin-maintenance-ticket', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title,
          description,
          category,
          priority,
          assignedTo,
          lotNumber,
          reportedBy,
        }),
      })

      const result = await response.json().catch(() => null)

      if (!response.ok || !result?.success) {
        setMessage(result?.error || 'Unable to create this maintenance ticket.')
        return
      }

      setTitle('')
      setDescription('')
      setCategory('General')
      setPriority('Normal')
      setAssignedTo('')
      setLotNumber('')
      setReportedBy('')

      setMessage(
        result.smsStatus === 'sent'
          ? 'Maintenance ticket created and queued for the 7:00 a.m. print. Text alert sent to (314) 713-6100.'
          : `Maintenance ticket created and queued for the 7:00 a.m. print, but the text alert did not send: ${result.smsMessage || 'unknown Twilio error'}`
      )
      loadTickets()
    } catch (error: any) {
      setMessage(error?.message || 'Unable to create this maintenance ticket.')
    } finally {
      setCreating(false)
    }
  }

  async function updateStatus(id: string, status: string) {
    const updates: any = {
      status,
      completed_at: status === 'Completed' ? new Date().toISOString() : null,
    }

    const { error } = await supabase
      .from('maintenance_tickets')
      .update(updates)
      .eq('id', id)

    if (error) {
      setMessage(error.message)
      return
    }

    setMessage('Ticket updated.')
    loadTickets()
  }

  async function sendWorkOrdersNow() {
    if (!window.confirm('Send new approved work orders that have not printed yet to Gmail and the Epson printer now?')) return
    setSendingWorkOrders(true)
    setMessage('Creating the new work-order packet and sending it to Gmail and the Epson printer…')

    const { data: { session } } = await supabase.auth.getSession()
    const response = await fetch('/api/maintenance-work-order-report', {
      method: 'POST',
      headers: { Authorization: `Bearer ${session?.access_token || ''}` },
    })
    const result = await response.json().catch(() => null)
    setMessage(result?.message || result?.error || 'Unable to send the work-order packet.')
    setSendingWorkOrders(false)
  }

  async function setApproval(id: string, approved: boolean) {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    const { error } = await supabase
      .from('maintenance_tickets')
      .update({
        admin_approved: approved,
        approved_at: approved ? new Date().toISOString() : null,
        approved_by: approved ? user?.email || 'Admin' : null,
        ...(approved ? { work_order_printed_at: null } : { status: 'Open', assigned_to: 'Open' }),
      })
      .eq('id', id)

    setMessage(error ? error.message : approved ? 'Work order approved.' : 'Approval removed.')
    if (!error) {
      await markAdminAlertsSeen(supabase, 'maintenance_request', id)
      loadTickets()
    }
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
    await markAdminAlertsSeen(supabase, 'maintenance_request', id)
    loadTickets()
  }

  const emergencyCount =
    tickets.filter((t) => t.priority === 'Emergency').length
  const pendingCount = tickets.filter((t) => !t.admin_approved).length
  const filteredTickets = tickets.filter((ticket) => {
    const matchesSearch =
      ticket.title?.toLowerCase().includes(search.toLowerCase()) ||
      ticket.lot_number?.toString().includes(search) ||
      ticket.reported_by?.toLowerCase().includes(search.toLowerCase())

    const matchesStatus =
      statusFilter === 'All' ||
      (statusFilter === 'Pending Approval'
        ? !ticket.admin_approved
        : statusFilter === 'Approved'
          ? ticket.admin_approved
          : ticket.status === statusFilter)

    return matchesSearch && matchesStatus
  })

  return (
    <main className="admin-maintenance-page">
      <section className="admin-maintenance-hero">
        <button type="button" onClick={() => router.push('/admin')}>← Back to Dashboard</button>
        <span><Wrench size={17} /> Maintenance operations</span>
        <h1>Work orders that are clear, approved, and easy to track.</h1>
        <p>Review camper-submitted requests, approve work for the maintenance crew, and keep every repair moving.</p>
        <div className="admin-maintenance-hero-actions" style={{ display: 'flex', flexWrap: 'wrap', gap: 11 }}>
          <a className="admin-maintenance-archive-button" href="/admin/maintenance/archive"><Archive size={16} /> Completed Tickets ({archivedCount}) <ArrowRight size={16} /></a>
          <a href="/admin/maintenance/supplies">Supply requests <ArrowRight size={16} /></a>
          <a href="/admin/maintenance/inventory">Manage inventory & receipts <ArrowRight size={16} /></a>
          <button
            type="button"
            onClick={sendWorkOrdersNow}
            disabled={sendingWorkOrders}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, minHeight: 38, marginTop: 22, border: '1px solid rgba(255,255,255,.24)', background: 'rgba(255,255,255,.12)', color: '#fff', fontSize: 12, fontWeight: 900 }}
          >
            <Printer size={16} /> {sendingWorkOrders ? 'Sending…' : 'Print New Work Orders Now'}
          </button>
        </div>
      </section>

      <section className="admin-maintenance-stats">
        <article><span className="slate"><ClipboardList size={19} /></span><div><small>Open</small><strong>{tickets.filter(t => t.status === 'Open').length}</strong></div></article>
        <article><span className="blue"><Hammer size={19} /></span><div><small>In progress</small><strong>{tickets.filter(t => t.status === 'In Progress').length}</strong></div></article>
        <article><span className="green"><Archive size={19} /></span><div><small>Archived</small><strong>{archivedCount}</strong></div></article>
        <article><span className="red"><Wrench size={19} /></span><div><small>Emergency</small><strong>{emergencyCount}</strong></div></article>
        <article><span className="gold"><ShieldCheck size={19} /></span><div><small>Pending approval</small><strong>{pendingCount}</strong></div></article>
      </section>

      <div className="admin-maintenance-layout">
        <section className="admin-maintenance-create">
          <div className="admin-maintenance-heading">
            <span>NEW WORK ORDER</span>
            <h2>Create maintenance ticket</h2>
            <p>Admin-created work orders are approved immediately.</p>
          </div>

          <input placeholder="Ticket title" value={title} onChange={(e) => setTitle(e.target.value)} />

          <div className="admin-maintenance-form-grid">
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option>General</option>
              <option>Electric</option>
              <option>Water</option>
              <option>Gate</option>
              <option>Roads</option>
              <option>Rec Hall</option>
              <option>Bathroom</option>
              <option>Tree / Grounds</option>
            </select>

            <select value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option>Low</option>
              <option>Normal</option>
              <option>High</option>
              <option>Emergency</option>
            </select>
          </div>

          <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
            <option value="">Assign To</option>
            <option>Anthony Finley</option>
            <option>Dawn Finley</option>
            <option>Charlie Kimball</option>
            <option>Rachel Finley</option>
            <option>Joe Johnson</option>
            <option>Vendor</option>
            <option>Electrician</option>
            <option>Plumber</option>
          </select>

          <div className="admin-maintenance-form-grid">
            <input placeholder="Lot number" value={lotNumber} onChange={(e) => setLotNumber(e.target.value)} />
            <input placeholder="Reported by" value={reportedBy} onChange={(e) => setReportedBy(e.target.value)} />
          </div>

          <textarea placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} />

          <button type="button" onClick={createTicket} disabled={creating}>
            {creating ? 'Creating & Texting…' : 'Create Ticket'}
          </button>
          {message && <p className="maintenance-submit-message">{message}</p>}
        </section>

        <section className="admin-maintenance-board">
          <div className="admin-maintenance-board-top">
            <div className="admin-maintenance-heading">
              <span>CURRENT WORK ORDERS</span>
              <h2>Review and approve work</h2>
            </div>

            <div className="admin-maintenance-filters">
              <label>
                <Search size={15} />
                <input placeholder="Search lot, camper, title..." value={search} onChange={(e) => setSearch(e.target.value)} />
              </label>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option>All</option>
                <option>Open</option>
                <option>In Progress</option>
                <option>Waiting Parts</option>
                <option>Pending Approval</option>
                <option>Approved</option>
              </select>
            </div>
          </div>

          <div className="admin-maintenance-ticket-list">
            {filteredTickets.map((ticket) => (
              <article key={ticket.id} className={`admin-maintenance-ticket ${!ticket.admin_approved ? 'pending' : ''}`}>
                <div className="admin-maintenance-ticket-main">
                  <div>
                    <small>{new Date(ticket.created_at).toLocaleDateString()} · Lot {ticket.lot_number || 'N/A'} · {ticket.category || 'General'}</small>
                    <h3>{ticket.title}</h3>
                    <p>{ticket.description || 'No description entered.'}</p>
                  </div>
                  <span className={ticket.admin_approved ? 'maintenance-approval-badge approved' : 'maintenance-approval-badge pending'}>
                    {ticket.admin_approved ? 'Approved for Work' : 'Pending Approval'}
                  </span>
                </div>

                <div className="admin-maintenance-ticket-meta">
                  <span><strong>Reported:</strong> {ticket.reported_by || 'N/A'}</span>
                  <span><strong>Assigned:</strong> {ticket.assigned_to || 'Open'}</span>
                  <span><strong>Status:</strong> <MaintenanceBadge kind="status" value={ticket.status} /></span>
                  <span><strong>Priority:</strong> <MaintenanceBadge kind="priority" value={ticket.priority} /></span>
                </div>

                <div className="admin-maintenance-ticket-actions">
                  {!ticket.admin_approved ? (
                    <button className="maintenance-approve-button" onClick={() => setApproval(ticket.id, true)}>Approve Work</button>
                  ) : (
                    <button onClick={() => setApproval(ticket.id, false)}>Remove Approval</button>
                  )}
                  <button onClick={() => updateStatus(ticket.id, 'Open')}>Open</button>
                  <button onClick={() => updateStatus(ticket.id, 'In Progress')}>In Progress</button>
                  <button onClick={() => updateStatus(ticket.id, 'Waiting Parts')}>Waiting Parts</button>
                  <button onClick={() => updateStatus(ticket.id, 'Completed')}>Completed</button>
                  <button onClick={async () => {
                    await markAdminAlertsSeen(supabase, 'maintenance_request', ticket.id)
                    router.push(`/admin/maintenance/${ticket.id}`)
                  }}>View Ticket</button>
                  <button className="danger" onClick={() => deleteTicket(ticket.id)}><Trash2 size={15} /> Delete</button>
                </div>
              </article>
            ))}

            {filteredTickets.length === 0 && (
              <div className="admin-maintenance-empty">
                <Wrench size={32} />
                <h3>No matching work orders</h3>
                <p>Try another search or filter.</p>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  )
}
