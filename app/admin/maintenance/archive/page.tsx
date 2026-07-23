'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Archive, CheckCircle2, Search, Wrench } from 'lucide-react'
import { supabase } from '../../../../lib/supabase'
import { MaintenanceBadge } from '../../../../components/MaintenanceBadge'

export default function MaintenanceArchivePage() {
  const [tickets, setTickets] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [priority, setPriority] = useState('All')
  const router = useRouter()

  useEffect(() => {
    loadTickets()
  }, [])

  async function loadTickets() {
    setLoading(true)

    const { data, error: loadError } = await supabase
      .from('maintenance_tickets')
      .select('*')
      .eq('status', 'Completed')
      .order('completed_at', { ascending: false, nullsFirst: false })

    setTickets(data || [])
    setError(loadError?.message || '')
    setLoading(false)
  }

  const filteredTickets = useMemo(() => {
    const query = search.trim().toLowerCase()

    return tickets.filter((ticket) => {
      const matchesSearch =
        !query ||
        ticket.title?.toLowerCase().includes(query) ||
        ticket.description?.toLowerCase().includes(query) ||
        ticket.lot_number?.toString().toLowerCase().includes(query) ||
        ticket.reported_by?.toLowerCase().includes(query) ||
        ticket.completion_notes?.toLowerCase().includes(query)

      const matchesPriority = priority === 'All' || ticket.priority === priority
      return matchesSearch && matchesPriority
    })
  }, [priority, search, tickets])

  return (
    <main className="admin-maintenance-page">
      <section className="admin-maintenance-hero">
        <button type="button" onClick={() => router.push('/admin/maintenance')}>
          ← Back to Active Work Orders
        </button>
        <span><Archive size={17} /> Maintenance archive</span>
        <h1>Completed work stays saved without crowding today’s queue.</h1>
        <p>Search past repairs, completion notes, lots, and assigned team members whenever you need the history.</p>
      </section>

      <section
        className="admin-maintenance-stats"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}
      >
        <article>
          <span className="green"><CheckCircle2 size={19} /></span>
          <div><small>Completed tickets</small><strong>{tickets.length}</strong></div>
        </article>
        <article>
          <span className="red"><Wrench size={19} /></span>
          <div><small>Emergency repairs</small><strong>{tickets.filter((ticket) => ticket.priority === 'Emergency').length}</strong></div>
        </article>
        <article>
          <span className="slate"><Archive size={19} /></span>
          <div><small>Showing now</small><strong>{filteredTickets.length}</strong></div>
        </article>
      </section>

      <section className="admin-maintenance-board" style={{ maxWidth: 1280, margin: '0 auto' }}>
        <div className="admin-maintenance-board-top">
          <div className="admin-maintenance-heading">
            <span>COMPLETED WORK</span>
            <h2>Maintenance ticket archive</h2>
            <p>Completed tickets leave the active queue automatically.</p>
          </div>

          <div className="admin-maintenance-filters">
            <label>
              <Search size={15} />
              <input
                placeholder="Search lot, title, person, notes..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <select value={priority} onChange={(event) => setPriority(event.target.value)}>
              <option>All</option>
              <option>Low</option>
              <option>Normal</option>
              <option>High</option>
              <option>Emergency</option>
            </select>
          </div>
        </div>

        <div className="admin-maintenance-ticket-list">
          {loading && (
            <div className="admin-maintenance-empty">
              <Archive size={32} />
              <h3>Loading completed work…</h3>
            </div>
          )}

          {!loading && error && (
            <div className="admin-maintenance-empty">
              <Wrench size={32} />
              <h3>Archive could not load</h3>
              <p>{error}</p>
            </div>
          )}

          {!loading && !error && filteredTickets.map((ticket) => (
            <article key={ticket.id} className="admin-maintenance-ticket">
              <div className="admin-maintenance-ticket-main">
                <div>
                  <small>
                    Completed {ticket.completed_at ? new Date(ticket.completed_at).toLocaleDateString() : 'date not recorded'}
                    {' · '}Lot {ticket.lot_number || 'N/A'}{' · '}{ticket.category || 'General'}
                  </small>
                  <h3>{ticket.title}</h3>
                  <p>{ticket.completion_notes || ticket.description || 'No completion notes entered.'}</p>
                </div>
                <MaintenanceBadge kind="status" value={ticket.status} />
              </div>

              <div className="admin-maintenance-ticket-meta">
                <span><strong>Reported:</strong> {ticket.reported_by || 'N/A'}</span>
                <span><strong>Assigned:</strong> {ticket.assigned_to || 'Open'}</span>
                <span><strong>Priority:</strong> <MaintenanceBadge kind="priority" value={ticket.priority} /></span>
              </div>

              <div className="admin-maintenance-ticket-actions">
                <Link href={`/admin/maintenance/${ticket.id}`}>View Archived Ticket</Link>
              </div>
            </article>
          ))}

          {!loading && !error && filteredTickets.length === 0 && (
            <div className="admin-maintenance-empty">
              <CheckCircle2 size={32} />
              <h3>No completed tickets match</h3>
              <p>Try another search or priority.</p>
            </div>
          )}
        </div>
      </section>
    </main>
  )
}
