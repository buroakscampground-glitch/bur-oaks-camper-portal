'use client'

import { useEffect, useState } from 'react'
import {
  ArrowRight,
  Bell,
  CalendarDays,
  ChevronRight,
  CircleDollarSign,
  FileText,
  Gauge,
  LogOut,
  MapPin,
  Megaphone,
  ReceiptText,
  TentTree,
  UserRound,
  UsersRound,
  Wrench,
  Zap,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import PortalWeather from '../../components/PortalWeather'

const serviceLinks = [
  {
    href: '/invoices',
    title: 'Invoices & AutoPay',
    description: 'View balances, pay invoices, or manage AutoPay.',
    icon: ReceiptText,
    accent: 'gold',
  },
  {
    href: '/electric',
    title: 'Electric Usage',
    description: 'Review meter readings, usage, and billing history.',
    icon: Zap,
    accent: 'blue',
  },
  {
    href: '/maintenance',
    title: 'Maintenance',
    description: 'Submit a request and follow its progress.',
    icon: Wrench,
    accent: 'orange',
  },
  {
    href: '/calendar',
    title: 'Events Calendar',
    description: 'See what is happening around the campground.',
    icon: CalendarDays,
    accent: 'green',
  },
  {
    href: '/documents',
    title: 'My Documents',
    description: 'Open forms, notices, and files shared with you.',
    icon: FileText,
    accent: 'plum',
  },
  {
    href: '/profile',
    title: 'Camper Profile',
    description: 'Keep contact, vehicle, and emergency details current.',
    icon: UserRound,
    accent: 'slate',
  },
  {
    href: '/directory',
    title: 'Camper Directory',
    description: 'Find campground neighbors who have chosen to be listed.',
    icon: UsersRound,
    accent: 'green',
  },
]

function formatDate(value?: string) {
  if (!value) return 'Date coming soon'

  const date = new Date(`${value}T12:00:00`)

  if (Number.isNaN(date.getTime())) return value

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export default function CamperPortalPage() {
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
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser()

        if (userError) throw userError

        if (!user) {
          window.location.href = '/login'
          return
        }

        const { data: camperData, error: camperError } = await supabase
          .from('campers')
          .select('*')
          .eq('email', user.email)
          .single()

        if (camperError) throw camperError

        if (camperData?.role?.toLowerCase() === 'admin') {
          window.location.replace('/admin')
          return
        }

        if (camperData?.role?.toLowerCase() === 'maintenance') {
          window.location.replace('/maintenance/dashboard')
          return
        }

        if (!camperData) return

        setCamper(camperData)

        const today = new Date().toISOString().split('T')[0]
        const [invoiceResult, electricResult, documentResult, eventResult, announcementResult, alertResult] =
          await Promise.all([
            supabase
              .from('invoices')
              .select('*')
              .eq('camper_id', camperData.id),
            supabase
              .from('electric_readings')
              .select('*')
              .eq('camper_id', camperData.id)
              .order('reading_date', { ascending: false })
              .limit(1)
              .maybeSingle(),
            supabase.from('documents').select('*'),
            supabase
              .from('events')
              .select('*')
              .gte('event_date', today)
              .order('event_date', { ascending: true })
              .limit(4),
            supabase
              .from('announcements')
              .select('*')
              .eq('is_active', true)
              .order('created_at', { ascending: false })
              .limit(3),
            supabase
              .from('text_reminders')
              .select('*')
              .order('sent_at', { ascending: false })
              .limit(4),
          ])

        setInvoices(invoiceResult.data || [])
        setLatestElectric(electricResult.data || null)
        setDocuments(documentResult.data || [])
        setEvents(eventResult.data || [])
        setAnnouncements(announcementResult.data || [])
        setAlerts(alertResult.data || [])
      } catch (error) {
        console.error('Unable to load camper portal:', error)
      } finally {
        setLoading(false)
      }
    }

    loadDashboard()
  }, [])

  async function handleLogout() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  if (loading) {
    return (
      <main className="camper-portal-page">
        <div className="portal-loading">
          <TentTree size={34} />
          <p>Opening your camper portal…</p>
        </div>
      </main>
    )
  }

  const openInvoices = invoices.filter((invoice) => invoice.status !== 'paid')
  const openBalance = openInvoices.reduce(
    (sum, invoice) => sum + Number(invoice.total_due || 0),
    0
  )
  const nextEvent = events[0]

  return (
    <main className="camper-portal-page">
      <div className="portal-shell">
        <section className="portal-hero">
          <nav className="portal-topbar" aria-label="Camper portal navigation">
            <a className="portal-brand" href="/portal">
              <img src="/bur-oaks-logo.png" alt="Bur Oaks Campground" />
              <span>
                <strong>Bur Oaks</strong>
                <small>Camper Portal</small>
              </span>
            </a>

            <button className="portal-logout" type="button" onClick={handleLogout}>
              <LogOut size={17} />
              Sign out
            </button>
          </nav>

          <div className="portal-hero-content">
            <div className="portal-eyebrow">
              <TentTree size={16} /> Your campground home base
            </div>
            <div className="portal-site-badge">
              <MapPin size={18} />
              <div>
                <small>Your site</small>
                <strong>Lot {camper?.lot_number || '—'}</strong>
              </div>
            </div>
            <h1>Welcome back, {camper?.first_name || 'Camper'}.</h1>
            <p>
              Everything for your stay at Bur Oaks—from account details to
              campground happenings—is right here.
            </p>

            <div className="portal-hero-actions">
              <a className="portal-primary-action" href="/invoices">
                Billing & payments <ArrowRight size={18} />
              </a>
              <a className="portal-secondary-action" href="/maintenance">
                Request maintenance
              </a>
            </div>
          </div>

        </section>

        <PortalWeather />

        <section className="portal-snapshot" aria-label="Account overview">
          <a href="/invoices" className="portal-snapshot-item">
            <span className="portal-snapshot-icon green">
              <CircleDollarSign size={22} />
            </span>
            <span>
              <small>Open balance</small>
              <strong>${openBalance.toFixed(2)}</strong>
              <em>{openInvoices.length} open invoice{openInvoices.length === 1 ? '' : 's'}</em>
            </span>
          </a>

          <a href="/electric" className="portal-snapshot-item">
            <span className="portal-snapshot-icon blue">
              <Gauge size={22} />
            </span>
            <span>
              <small>Latest electric</small>
              <strong>${Number(latestElectric?.amount_due || 0).toFixed(2)}</strong>
              <em>{latestElectric?.kwh_used || 0} kWh used</em>
            </span>
          </a>

          <a href="/calendar" className="portal-snapshot-item">
            <span className="portal-snapshot-icon gold">
              <CalendarDays size={22} />
            </span>
            <span>
              <small>Next event</small>
              <strong>{nextEvent?.title || 'Nothing scheduled'}</strong>
              <em>{nextEvent ? formatDate(nextEvent.event_date) : 'Check back soon'}</em>
            </span>
          </a>

          <a href="/documents" className="portal-snapshot-item">
            <span className="portal-snapshot-icon plum">
              <FileText size={22} />
            </span>
            <span>
              <small>Documents</small>
              <strong>{documents.length}</strong>
              <em>Available in your portal</em>
            </span>
          </a>
        </section>

        <div className="portal-content-grid">
          <section className="portal-panel portal-services-panel">
            <div className="portal-section-heading">
              <div>
                <span>YOUR STAY</span>
                <h2>What can we help with?</h2>
              </div>
            </div>

            <div className="portal-service-grid">
              {serviceLinks.map((service) => {
                const Icon = service.icon

                return (
                  <a className="portal-service-card" href={service.href} key={service.href}>
                    <span className={`portal-service-icon ${service.accent}`}>
                      <Icon size={23} />
                    </span>
                    <span className="portal-service-copy">
                      <strong>{service.title}</strong>
                      <small>{service.description}</small>
                    </span>
                    <ChevronRight className="portal-service-arrow" size={20} />
                  </a>
                )
              })}
            </div>
          </section>

          <aside className="portal-panel portal-announcements-panel">
            <div className="portal-section-heading compact">
              <div>
                <span>FROM THE OFFICE</span>
                <h2>Announcements</h2>
              </div>
              <Megaphone size={22} />
            </div>

            {announcements.length === 0 ? (
              <div className="portal-empty-state">
                <Megaphone size={26} />
                <p>No announcements right now.</p>
              </div>
            ) : (
              <div className="portal-feed">
                {announcements.map((announcement, index) => (
                  <article className={index === 0 ? 'featured' : ''} key={announcement.id}>
                    {index === 0 && <span className="portal-new-pill">LATEST</span>}
                    <h3>{announcement.title}</h3>
                    <p>{announcement.message}</p>
                  </article>
                ))}
              </div>
            )}
          </aside>
        </div>

        <div className="portal-bottom-grid">
          <section className="portal-panel">
            <div className="portal-section-heading compact">
              <div>
                <span>AROUND THE PARK</span>
                <h2>Upcoming events</h2>
              </div>
              <a href="/calendar">Full calendar</a>
            </div>

            {events.length === 0 ? (
              <div className="portal-empty-state horizontal">
                <CalendarDays size={26} />
                <p>No upcoming events are scheduled.</p>
              </div>
            ) : (
              <div className="portal-event-list">
                {events.map((event) => {
                  const date = new Date(`${event.event_date}T12:00:00`)

                  return (
                    <article key={event.id}>
                      <div className="portal-date-tile">
                        <span>{date.toLocaleDateString('en-US', { month: 'short' })}</span>
                        <strong>{date.getDate()}</strong>
                      </div>
                      <div>
                        <h3>{event.title}</h3>
                        <p>{event.description || 'More details will be shared soon.'}</p>
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </section>

          <section className="portal-panel">
            <div className="portal-section-heading compact">
              <div>
                <span>STAY INFORMED</span>
                <h2>Recent alerts</h2>
              </div>
              <Bell size={22} />
            </div>

            {alerts.length === 0 ? (
              <div className="portal-empty-state horizontal">
                <Bell size={26} />
                <p>You’re all caught up. No recent alerts.</p>
              </div>
            ) : (
              <div className="portal-alert-list">
                {alerts.map((alert) => (
                  <article key={alert.id}>
                    <span className="portal-alert-dot" />
                    <div>
                      <h3>{alert.reminder_type || 'Campground update'}</h3>
                      <p>{alert.message}</p>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>

        <footer className="portal-footer">
          <span>Bur Oaks Campground</span>
          <span>
            <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a> · Lot{' '}
            {camper?.lot_number || '—'} · {camper?.first_name} {camper?.last_name}
          </span>
        </footer>
      </div>
    </main>
  )
}
