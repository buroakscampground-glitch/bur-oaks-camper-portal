'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function HomePage() {
  const [camper, setCamper] = useState<any>(null)
  const [invoices, setInvoices] = useState<any[]>([])
  const [electric, setElectric] = useState<any[]>([])
  const [documents, setDocuments] = useState<any[]>([])
  const [events, setEvents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadDashboard() {
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        window.location.href = '/login'
        return
      }

      const { data: camperData } = await supabase
        .from('campers')
        .select('*')
        .eq('email', user.email)
        .single()

      if (!camperData) {
        setLoading(false)
        return
      }

      setCamper(camperData)

      const { data: invoiceData } = await supabase
        .from('invoices')
        .select('*')
        .eq('camper_id', camperData.id)

      const { data: electricData } = await supabase
        .from('electric_readings')
        .select('*')
        .eq('camper_id', camperData.id)
        .order('reading_date', { ascending: false })

      const { data: documentData } = await supabase
        .from('documents')
        .select('*')
        .eq('camper_id', camperData.id)

      const { data: eventData } = await supabase
        .from('events')
        .select('*')
        .order('event_date', { ascending: true })
        .limit(5)

      setInvoices(invoiceData || [])
      setElectric(electricData || [])
      setDocuments(documentData || [])
      setEvents(eventData || [])
      setLoading(false)
    }

    loadDashboard()
  }, [])

  if (loading) return <p style={{ padding: '40px' }}>Loading portal...</p>

  const openBalance = invoices
    .filter((invoice) => invoice.status !== 'paid')
    .reduce((sum, invoice) => sum + Number(invoice.total_due || 0), 0)

  const latestElectric = electric[0]

  return (
    <main className="page">
      <div className="container">
        <section
          className="card"
          style={{
            marginBottom: '25px',
            background: 'linear-gradient(135deg, #ffffff 0%, #e9f2e4 100%)',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div style={{ position: 'absolute', right: 25, top: 20, fontSize: 90, opacity: 0.16 }}>
            🌳
          </div>

          <p className="muted">BUR OAKS CAMPGROUND</p>
          <h1>Welcome Back {camper?.first_name}</h1>
          <h2 style={{ color: '#2f5d3a', marginTop: 0 }}>A Site to Remember</h2>
          <p className="muted">CAMP. RELAX. EXPLORE.</p>
        </section>

        <div className="grid grid-3" style={{ marginBottom: '25px' }}>
          <a className="card admin-link" href="/invoices">
            <h2>${openBalance.toFixed(2)}</h2>
            <p className="muted">Open Balance</p>
          </a>

          <a className="card admin-link" href="/electric">
            <h2>{latestElectric ? latestElectric.kwh_used : 0} kWh</h2>
            <p className="muted">Latest Electric Usage</p>
          </a>

          <a className="card admin-link" href="/documents">
            <h2>{documents.length}</h2>
            <p className="muted">Documents Available</p>
          </a>
        </div>

        <div className="grid grid-3">
          <a className="card admin-link" href="/invoices">
            <h2>Invoices</h2>
            <p>View current and past campground invoices.</p>
          </a>

          <a className="card admin-link" href="/electric">
            <h2>Electric Usage</h2>
            <p>Track readings, usage, and electric charges.</p>
          </a>

          <a className="card admin-link" href="/documents">
            <h2>Documents</h2>
            <p>Access leases, rules, and camper files.</p>
          </a>

          <a className="card admin-link" href="/calendar">
            <h2>Events</h2>
            <p>See upcoming campground events.</p>
          </a>
        </div>

        <section className="card" style={{ marginTop: '25px' }}>
          <h2>Upcoming Events</h2>

          {events.length === 0 && <p className="muted">No upcoming events yet.</p>}

          {events.map((event) => (
            <p key={event.id}>
              <strong>{event.event_date}</strong> — {event.title}
            </p>
          ))}
        </section>
      </div>
    </main>
  )
}