'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Hammer,
  Search,
  ShieldCheck,
  Trash2,
  Wrench,
} from 'lucide-react'
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

    const reload = () => loadTickets()
    window.addEventListener('focus', reload)
    window.addEventListener('pageshow', reload)

    return () => {
      window.removeEventListener('focus', reload)
      window.removeEventListener('pageshow', reload)
    }
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
        admin_approved: true,
        approved_at: new Date().toISOString(),
        approved_by: 'Admin',
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
        ...(approved ? {} : { status: 'Open', assigned_to: 'Open' }),
      })
      .eq('id', id)

    setMessage(error ? error.message : approved ? 'Work order approved.' : 'Approval removed.')
    if (!error) loadTickets()
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
        <a href="/maintenance/history">View completed maintenance history <ArrowRight size={16} /></a>
      </section>

      <section className="admin-maintenance-stats">
        <article><span className="slate"><ClipboardList size={19} /></span><div><small>Open</small><strong>{tickets.filter(t => t.status === 'Open').length}</strong></div></article>
        <article><span className="blue"><Hammer size={19} /></span><div><small>In progress</small><strong>{tickets.filter(t => t.status === 'In Progress').length}</strong></div></article>
        <article><span className="green"><CheckCircle2 size={19} /></span><div><small>Completed</small><strong>{tickets.filter(t => t.status === 'Completed').length}</strong></div></article>
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

          <button type="button" onClick={createTicket}>Create Ticket</button>
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
                <option>Completed</option>
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
                  <button onClick={() => updateStatus(ticket.id, 'Completed')}>Completed</button>
                  <button onClick={() => router.push(`/admin/maintenance/${ticket.id}`)}>View Ticket</button>
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
