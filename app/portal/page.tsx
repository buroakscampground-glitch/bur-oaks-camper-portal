'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function HomePage() {
  async function handleLogout() {
  

  await supabase.auth.signOut()

  

  window.location.href = "/login"
}
  const [camper, setCamper] = useState<any>(null)
  const [invoices, setInvoices] = useState<any[]>([])
  const [documents, setDocuments] = useState<any[]>([])
  const [events, setEvents] = useState<any[]>([])
  const [announcements, setAnnouncements] = useState<any[]>([])
  const [alerts, setAlerts] = useState<any[]>([])
const [latestElectric, setLatestElectric] = useState<any>(null)
const [loading, setLoading] = useState(true)
  useEffect(() => {
    async function loadDashboard() {
      try {
        console.log('=== DASHBOARD START ===')

        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser()

        console.log('USER:', user)
        console.log('USER ERROR:', userError)

        if (userError) {
          throw userError
        }

        if (!user) {
          console.log('NO USER FOUND - REDIRECTING')
          window.location.href = '/login'
          return
        }

        const {
          data: camperData,
          error: camperError,
        } = await supabase
          .from('campers')
          .select('*')
          .eq('email', user.email)
          .single()

        console.log('USER EMAIL:', user.email)
        console.log('CAMPER DATA:', camperData)
        console.log('CAMPER ERROR:', camperError)

        if (camperError) {
          console.error('CAMPER QUERY FAILED:', camperError)
        }

        if (
          camperData?.role &&
          camperData.role.toLowerCase() === 'admin'
        ) {
          console.log('ADMIN DETECTED - REDIRECTING')
          window.location.replace('/admin')
          return
        }

        if (camperData) {
          setCamper(camperData)

          const {
            data: invoiceData,
            error: invoiceError,
          } = await supabase
            .from('invoices')
            .select('*')
            .eq('camper_id', camperData.id)

          console.log('INVOICE ERROR:', invoiceError)

          setInvoices(invoiceData || [])
        }
const { data: electricData } = await supabase
  .from('electric_readings')
  .select('*')
  .eq('camper_id', camperData.id)
  .order('reading_date', { ascending: false })
  .limit(1)
  .single()

setLatestElectric(electricData)
        const {
          data: documentData,
          error: documentError,
        } = await supabase
          .from('documents')
          .select('*')

        console.log('DOCUMENT ERROR:', documentError)

        setDocuments(documentData || [])

        const {
  data: eventData,
  error: eventError,
} = await supabase
  .from('events')
  .select('*')
  .gte('event_date', new Date().toISOString().split('T')[0])
  .order('event_date', { ascending: true })
  .limit(5)

        console.log('EVENT ERROR:', eventError)

        setEvents(eventData || [])

        const {
          data: announcementData,
          error: announcementError,
        } = await supabase
          .from('announcements')
          .select('*')
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(5)

        console.log('ANNOUNCEMENT ERROR:', announcementError)

        setAnnouncements(announcementData || [])

        const {
          data: alertData,
          error: alertError,
        } = await supabase
          .from('text_reminders')
          .select('*')
          .order('sent_at', { ascending: false })
          .limit(5)

        console.log('TEXT REMINDER ERROR:', alertError)

        setAlerts(alertData || [])

        console.log('=== DASHBOARD COMPLETE ===')
      } catch (error) {
        console.error('DASHBOARD FAILED:', error)
      } finally {
        console.log('LOADING FALSE')
        setLoading(false)
      }
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
  className="hero-card"
  style={{ marginBottom: '25px' }}
>
  <img
    src="/bur-oaks-logo.png"
    alt="Bur Oaks Campground"
    className="hero-logo"
  />

  <h1 className="hero-title">
    Welcome Back {camper?.first_name || ''}
  </h1>

  <p className="hero-subtitle">
    Your Bur Oaks Camper Portal
  </p>

  <button
    type="button"
    onClick={handleLogout}
    style={{
      background: "#cc0000",
      color: "white",
      padding: "10px 20px",
      fontSize: "16px",
      marginTop: "20px",
      cursor: "pointer",
      border: "none",
      borderRadius: "8px",
    }}
  >
    Logout
  </button>
</section>

        <div
          className="grid grid-3"
          style={{ marginBottom: '25px' }}
        >
          <a className="card admin-link" href="/invoices">
            <h2>${openBalance.toFixed(2)}</h2>
            <p className="muted">Open Balance</p>
          </a>

          <a className="card admin-link" href="/electric">
  <h2>
    $
    {Number(
      latestElectric?.amount_due || 0
    ).toFixed(2)}
  </h2>

  <p className="muted">
    Latest Electric Bill
  </p>

  <small>
    {latestElectric?.kwh_used || 0} kWh Used
  </small>
</a>

          <a className="card admin-link" href="/calendar">
  <h2>
    {events.length > 0
      ? events[0].title
      : 'No Events'}
  </h2>
  <p className="muted">Next Event</p>
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