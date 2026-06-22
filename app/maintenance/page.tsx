'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'
import { MaintenanceBadge } from '../../components/MaintenanceBadge'

export default function MaintenanceRequestPage() {
  const [camper, setCamper] = useState<any>(null)
  const [tickets, setTickets] = useState<any[]>([])
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('General')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    loadPage()
  }, [])

  async function loadPage() {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      window.location.href = '/login'
      return
    }

    const { data: camperData } = await supabase
      .from('campers')
      .select('*')
      .eq('email', user.email)
      .single()

    setCamper(camperData)

    if (camperData) {
      const { data: ticketData } = await supabase
        .from('maintenance_tickets')
        .select('*')
        .eq('lot_number', camperData.lot_number)
        .order('created_at', { ascending: false })

      setTickets(ticketData || [])
    }

    setLoading(false)
  }

  async function submitRequest() {
    if (!title || !description) {
      setMessage('Please add a title and description.')
      return
    }

    const { error } = await supabase
      .from('maintenance_tickets')
      .insert({
        title,
        description,
        category,
        status: 'Open',
        reported_by: `${camper?.first_name || ''} ${camper?.last_name || ''}`,
        lot_number: camper?.lot_number || '',
      })

    if (error) {
      setMessage(error.message)
      return
    }

    setTitle('')
    setDescription('')
    setCategory('General')
    setMessage('✅ Maintenance request submitted!')
    loadPage()
  }

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
<button
  onClick={() => router.push('/portal')}
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
  ← Back to Portal
</button>
          <h1>🔧 Maintenance Requests</h1>

          <h2 style={{ color: '#2f5d3a' }}>
            {tickets.length} Request
            {tickets.length !== 1 ? 's' : ''}
          </h2>

          <p className="muted">
            Report campground issues and track request status.
          </p>
        </section>

        <section
          className="card"
          style={{ marginBottom: '25px' }}
        >
          <h2>Submit a Request</h2>

          <p className="muted">
            Lot {camper?.lot_number || 'N/A'} —{' '}
            {camper?.first_name} {camper?.last_name}
          </p>

          <input
            placeholder="Issue Title"
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

          <textarea
            placeholder="Describe the issue..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            style={{
              display: 'block',
              width: '100%',
              minHeight: '130px',
              marginBottom: '12px',
            }}
          />

          <button onClick={submitRequest}>
            Submit Request
          </button>

          {message && (
            <p style={{ marginTop: '10px' }}>
              {message}
            </p>
          )}
        </section>

        <section className="card">
          <h2>My Maintenance Requests</h2>

          {tickets.length === 0 && (
            <p className="muted">
              You have not submitted any maintenance
              requests yet.
            </p>
          )}

          {tickets.map((ticket) => (
            <section
              key={ticket.id}
              className="card"
              style={{
                marginTop: '15px',
                borderLeft: `7px solid ${
                  ticket.status === 'Completed'
                    ? '#16a34a'
                    : ticket.status === 'In Progress'
                    ? '#2563eb'
                    : ticket.status === 'Waiting Parts'
                    ? '#f97316'
                    : '#6b7280'
                }`,
              }}
            >
              <p className="muted">
                {new Date(
                  ticket.created_at
                ).toLocaleDateString()}
              </p>

              <h3>{ticket.title}</h3>

              <p>
                <strong>Category:</strong>{' '}
                {ticket.category}
              </p>

              <p>
                <strong>Status:</strong>{' '}
                <MaintenanceBadge kind="status" value={ticket.status} />
              </p>

              <p>{ticket.description}</p>
            </section>
          ))}
        </section>
      </div>
    </main>
  )
}
