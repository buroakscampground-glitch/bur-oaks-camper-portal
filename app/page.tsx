'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function HomePage() {
  const [camper, setCamper] = useState<any>(null)
  const [invoices, setInvoices] = useState<any[]>([])
  const [documents, setDocuments] = useState<any[]>([])
  const [events, setEvents] = useState<any[]>([])
  const [announcements, setAnnouncements] = useState<any[]>([])
  const [alerts, setAlerts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadDashboard() {
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

      console.log('USER EMAIL:', user.email)
      console.log('CAMPER DATA:', camperData)
      console.log('ROLE:', camperData?.role)

      /*
      if (
        camperData?.role &&
        camperData.role.toLowerCase() === 'admin'
      ) {
        window.location.href = '/admin'
        return
      }
      */

      if (camperData) {
        if (
          camperData.role &&
          camperData.role.toLowerCase() === 'admin'
        ) {
          window.location.replace('/admin')
          return
        }

        setCamper(camperData)

        const { data: invoiceData } = await supabase
          .from('invoices')
          .select('*')
          .eq('camper_id', camperData.id)

        setInvoices(invoiceData || [])
      }

      const { data: documentData } = await supabase
        .from('documents')
        .select('*')

      setDocuments(documentData || [])

      const { data: eventData } = await supabase
        .from('events')
        .select('*')
        .limit(5)

      setEvents(eventData || [])

      const { data: announcementData } = await supabase
        .from('announcements')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(5)

      setAnnouncements(announcementData || [])

      const { data: alertData } = await supabase
        .from('text_reminders')
        .select('*')
        .order('sent_at', { ascending: false })
        .limit(5)

      setAlerts(alertData || [])

      setLoading(false)
    }

    loadDashboard()
  }, [])

  if (loading) {
    return <div style={{ padding: '40px' }}>Loading Portal...</div>
  }

  const openBalance = invoices
    .filter((invoice) => invoice.status !== 'paid')
    .reduce((sum, invoice) => sum + Number(invoice.total_due || 0), 0)

  return (
    <main className="page">
      <div className="container">
        <section
          className="card"
          style={{
            marginBottom: '25px',
            background: 'linear-gradient(135deg, #ffffff 0%, #eef4ea 100%)',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              position: 'absolute',
              right: 25,
              top: 20,
              fontSize: 90,
              opacity: 0.15,
            }}
          >
            🌳
          </div>

          <p className="muted">BUR OAKS CAMPGROUND</p>

          <h1>
            Welcome Back {camper?.first_name || ''}
          </h1>

          <h2 style={{ color: '#2f5d3a' }}>
            A Site to Remember
          </h2>

          <p className="muted">
            CAMP. RELAX. EXPLORE.
          </p>
        </section>

        <div
          className="grid grid-3"
          style={{ marginBottom: '25px' }}
        >
          <a className="card admin-link" href="/invoices">
            <h2>${openBalance.toFixed(2)}</h2>
            <p className="muted">Open Balance</p>
          </a>

          <a className="card admin-link" href="/documents">
            <h2>{documents.length}</h2>
            <p className="muted">Documents</p>
          </a>

          <a className="card admin-link" href="/calendar">
            <h2>{events.length}</h2>
            <p className="muted">Upcoming Events</p>
          </a>

          <a className="card admin-link" href="/maintenance">
            <h2>🔧</h2>
            <p className="muted">Maintenance Request</p>
          </a>
        </div>

        <section
          className="card"
          style={{ marginBottom: '25px' }}
        >
          <h2>📢 Campground Announcements</h2>

          {announcements.length === 0 && (
            <p className="muted">
              No announcements at this time.
            </p>
          )}

          {announcements.map((announcement) => (
            <div
              key={announcement.id}
              style={{
                borderTop: '1px solid #e3ded2',
                paddingTop: '15px',
                marginTop: '15px',
              }}
            >
              <h3>{announcement.title}</h3>
              <p>{announcement.message}</p>
            </div>
          ))}
        </section>

        <section
          className="card"
          style={{ marginBottom: '25px' }}
        >
          <h2>📱 Recent Alerts</h2>

          {alerts.length === 0 && (
            <p className="muted">
              No alerts at this time.
            </p>
          )}

          {alerts.map((alert) => (
            <div
              key={alert.id}
              style={{
                borderTop: '1px solid #e3ded2',
                paddingTop: '15px',
                marginTop: '15px',
              }}
            >
              <h3>{alert.reminder_type}</h3>
              <p>{alert.message}</p>
            </div>
          ))}
        </section>

        <section className="card">
          <h2>📅 Upcoming Events</h2>

          {events.length === 0 && (
            <p className="muted">
              No events scheduled.
            </p>
          )}

          {events.map((event) => (
            <div
              key={event.id}
              style={{
                borderTop: '1px solid #e3ded2',
                paddingTop: '15px',
                marginTop: '15px',
              }}
            >
              <h3>{event.title}</h3>
            </div>
          ))}
        </section>
      </div>
    </main>
  )
}