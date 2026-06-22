'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '../../../lib/supabase'
import { MaintenanceBadge } from '../../../components/MaintenanceBadge'

export default function MaintenanceHistoryPage() {
  const [tickets, setTickets] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [assignedFilter, setAssignedFilter] = useState('All')

  useEffect(() => {
    loadHistory()
  }, [])

  async function loadHistory() {
    const { data, error: loadError } = await supabase
      .from('maintenance_tickets')
      .select('*')
      .eq('status', 'Completed')
      .order('completed_at', { ascending: false, nullsFirst: false })

    if (loadError) {
      setError(loadError.message)
    } else {
      setTickets(data || [])
    }

    setLoading(false)
  }

  const assignees = useMemo(
    () =>
      Array.from(
        new Set(
          tickets
            .map((ticket) => ticket.assigned_to)
            .filter((name): name is string => Boolean(name))
        )
      ).sort(),
    [tickets]
  )

  const filteredTickets = tickets.filter((ticket) => {
    const query = search.trim().toLowerCase()
    const matchesSearch =
      !query ||
      ticket.title?.toLowerCase().includes(query) ||
      ticket.description?.toLowerCase().includes(query) ||
      ticket.lot_number?.toString().toLowerCase().includes(query) ||
      ticket.reported_by?.toLowerCase().includes(query) ||
      ticket.completion_notes?.toLowerCase().includes(query)

    const matchesAssignee =
      assignedFilter === 'All' || ticket.assigned_to === assignedFilter

    return matchesSearch && matchesAssignee
  })

  if (loading) {
    return <div style={{ padding: '40px' }}>Loading maintenance history...</div>
  }

  return (
    <main className="page">
      <div className="container">
        <Link
          href="/maintenance/dashboard"
          style={{
            display: 'inline-block',
            marginBottom: '20px',
            textDecoration: 'none',
            fontWeight: 'bold',
          }}
        >
          ← Back to Maintenance Dashboard
        </Link>

        <section className="card" style={{ marginBottom: '25px' }}>
          <p className="muted">BUR OAKS CAMPGROUND</p>
          <h1>🕘 Maintenance History</h1>
          <p className="muted">
            Review completed tickets, work performed, and completion notes.
          </p>
        </section>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '15px',
            marginBottom: '25px',
          }}
        >
          <section className="card">
            <h3>Completed</h3>
            <h1>{tickets.length}</h1>
          </section>
          <section className="card">
            <h3>Emergency Repairs</h3>
            <h1>{tickets.filter((ticket) => ticket.priority === 'Emergency').length}</h1>
          </section>
          <section className="card">
            <h3>Work Orders</h3>
            <h1>{tickets.filter((ticket) => ticket.work_order).length}</h1>
          </section>
        </div>

        <section className="card">
          <div
            style={{
              display: 'flex',
              gap: '10px',
              flexWrap: 'wrap',
              marginBottom: '20px',
            }}
          >
            <input
              aria-label="Search maintenance history"
              placeholder="Search title, lot, camper, or notes..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              style={{ flex: '1 1 280px' }}
            />

            <select
              aria-label="Filter by assignee"
              value={assignedFilter}
              onChange={(event) => setAssignedFilter(event.target.value)}
            >
              <option>All</option>
              {assignees.map((assignee) => (
                <option key={assignee}>{assignee}</option>
              ))}
            </select>
          </div>

          {error && <p style={{ color: '#b91c1c' }}>{error}</p>}

          {!error && filteredTickets.length === 0 && (
            <p className="muted">No completed maintenance tickets found.</p>
          )}

          {filteredTickets.map((ticket) => (
            <article
              key={ticket.id}
              style={{ borderTop: '1px solid #e3ded2', padding: '18px 0' }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: '12px',
                  flexWrap: 'wrap',
                }}
              >
                <div>
                  <p className="muted" style={{ marginTop: 0 }}>
                    Completed{' '}
                    {ticket.completed_at
                      ? new Date(ticket.completed_at).toLocaleString()
                      : 'date not recorded'}
                  </p>
                  <h3>{ticket.title}</h3>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <MaintenanceBadge kind="status" value={ticket.status} />
                  <MaintenanceBadge kind="priority" value={ticket.priority} />
                </div>
              </div>

              <p>
                <strong>Lot:</strong> {ticket.lot_number || 'N/A'} ·{' '}
                <strong>Assigned To:</strong> {ticket.assigned_to || 'Unassigned'}
              </p>
              <p>
                <strong>Reported By:</strong> {ticket.reported_by || 'N/A'}
              </p>
              {ticket.completion_notes && (
                <p>
                  <strong>Completion Notes:</strong> {ticket.completion_notes}
                </p>
              )}

              <Link href={`/maintenance/dashboard/${ticket.id}`}>
                View Completed Ticket
              </Link>
            </article>
          ))}
        </section>
      </div>
    </main>
  )
}
