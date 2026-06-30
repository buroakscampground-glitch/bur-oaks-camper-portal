'use client'

import { useEffect, useState } from 'react'
import {
  ArrowRight,
  AlertTriangle,
  Bell,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  ClipboardCheck,
  Droplets,
  FileText,
  Gauge,
  Home,
  LogOut,
  MapPin,
  Megaphone,
  MessageCircle,
  ReceiptText,
  ShieldCheck,
  Soup,
  Sparkles,
  TentTree,
  UserRound,
  UsersRound,
  Wrench,
  Zap,
} from 'lucide-react'
import { getCurrentCamper, supabase } from '../../lib/supabase'
import PortalWeather, { PortalWeatherMini } from '../../components/PortalWeather'
import EventFlyerShowcase from '../../components/EventFlyerShowcase'
import { saturdayDinners2026 } from '../../lib/saturday-dinners'

const serviceLinks = [
  {
    href: '/site',
    title: 'My Site',
    description: 'See your lot, account status, documents, and site details.',
    icon: Home,
    accent: 'green',
  },
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
    href: '/dinners',
    title: 'Saturday Dinners',
    description: 'See the monthly menu and tell us what you are bringing.',
    icon: Soup,
    accent: 'gold',
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
    description: 'Update contact info and upload golf cart insurance.',
    icon: UserRound,
    accent: 'slate',
  },
  {
    href: '/messages',
    title: 'Message the Office',
    description: 'Send a private note to Bur Oaks and see replies.',
    icon: MessageCircle,
    accent: 'blue',
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

function getMaintenanceDisplayStatus(ticket?: any) {
  if (!ticket) return 'No active requests'
  if (!ticket.admin_approved) return 'Awaiting Approval'
  return ticket.status || 'Open'
}

function formatFriendlyToday() {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
}

function getPortalSeason() {
  const month = new Date().getMonth()

  if (month >= 2 && month <= 4) return 'spring'
  if (month >= 5 && month <= 7) return 'summer'
  if (month >= 8 && month <= 10) return 'fall'
  return 'winter'
}

export default function CamperPortalPage() {
  const [camper, setCamper] = useState<any>(null)
  const [invoices, setInvoices] = useState<any[]>([])
  const [documents, setDocuments] = useState<any[]>([])
  const [events, setEvents] = useState<any[]>([])
  const [announcements, setAnnouncements] = useState<any[]>([])
  const [alerts, setAlerts] = useState<any[]>([])
  const [maintenanceTickets, setMaintenanceTickets] = useState<any[]>([])
  const [latestElectric, setLatestElectric] = useState<any>(null)
  const [unreadOfficeMessages, setUnreadOfficeMessages] = useState(0)
  const [loading, setLoading] = useState(true)
  const [pumpMessage, setPumpMessage] = useState('')
  const [requestingPump, setRequestingPump] = useState(false)

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

        const camperData = await getCurrentCamper()

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
        const [invoiceResult, electricResult, documentResult, eventResult, announcementResult, alertResult, maintenanceResult, messageResult] =
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
            supabase
              .from('documents')
              .select('*')
              .eq('camper_id', camperData.id),
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
            supabase
              .from('maintenance_tickets')
              .select('*')
              .eq('lot_number', camperData.lot_number)
              .order('created_at', { ascending: false })
              .limit(5),
            supabase
              .from('office_messages')
              .select('id', { count: 'exact', head: true })
              .eq('camper_id', camperData.id)
              .eq('sender_role', 'admin')
              .is('read_by_camper_at', null),
          ])

        setInvoices(invoiceResult.data || [])
        setLatestElectric(electricResult.data || null)
        setDocuments(documentResult.data || [])
        setEvents(eventResult.data || [])
        setAnnouncements(announcementResult.data || [])
        setAlerts(alertResult.data || [])
        setMaintenanceTickets(maintenanceResult.data || [])
        setUnreadOfficeMessages(messageResult.count || 0)
      } catch (error) {
        console.error('Unable to load camper portal:', error)
      } finally {
        setLoading(false)
      }
    }

    loadDashboard()

    const refresh = () => loadDashboard()
    const timer = window.setInterval(refresh, 30000)
    window.addEventListener('focus', refresh)
    window.addEventListener('pageshow', refresh)

    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refresh)
      window.removeEventListener('pageshow', refresh)
    }
  }, [])

  async function handleLogout() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  async function requestSewerPumpOut() {
    const confirmed = window.confirm('Request a sewer pump-out for your site? A $10 charge will be added to your next electric bill.')
    if (!confirmed) return

    setRequestingPump(true)
    setPumpMessage('Sending your sewer pump-out request…')

    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token

    if (!token) {
      window.location.href = '/login'
      return
    }

    const response = await fetch('/api/sewer-pump-out', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    })
    const result = await response.json().catch(() => null)

    if (!response.ok) {
      setPumpMessage(result?.error || 'Unable to send pump-out request.')
      setRequestingPump(false)
      return
    }

    let emailNote = ''
    if (result?.emailStatus === 'failed') emailNote = ' Office email alert failed, but the request was saved.'
    if (result?.emailStatus === 'skipped') emailNote = ' Office email alert skipped, but the request was saved.'

    setPumpMessage(`Sewer pump-out requested for Lot ${camper?.lot_number || 'your site'}. $10 will be added to your next electric bill.${emailNote}`)
    setRequestingPump(false)
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
  const documentsNeedingSignature = documents.filter(
    (document) =>
      document.signature_status !== 'signed' &&
      document.signature_status !== 'not_required'
  )
  const insuranceOnFile = documents.some(
    (document) => document.document_type === 'Golf Cart Insurance'
  )
  const activeMaintenance = maintenanceTickets.filter(
    (ticket) => ticket.status !== 'Completed'
  )
  const latestMaintenance = maintenanceTickets[0]
  const latestMaintenanceStatus = getMaintenanceDisplayStatus(latestMaintenance)
  const maintenanceHeadline = activeMaintenance.length
    ? `${latestMaintenanceStatus} · ${activeMaintenance.length} active`
    : latestMaintenance?.status === 'Completed'
      ? 'Completed'
      : 'No active requests'
  const maintenanceDetail = latestMaintenance
    ? `${latestMaintenance.title || 'Latest request'} · ${latestMaintenanceStatus}`
    : 'No open maintenance requests for your lot right now.'
  const latestAnnouncement = announcements[0]
  const profileFields = [
    camper?.phone,
    camper?.emergency_contact_name,
    camper?.emergency_contact_phone,
    camper?.vehicle_make,
    camper?.vehicle_model,
    camper?.license_plate,
  ]
  const completedProfileFields = profileFields.filter(Boolean).length
  const profileCompletion = Math.round((completedProfileFields / profileFields.length) * 100)
  const firstLoginTasks = [
    {
      label: 'Confirm contact info',
      complete: Boolean(camper?.email || camper?.secondary_email) && Boolean(camper?.phone),
      href: '/profile',
    },
    {
      label: 'Sign documents',
      complete: documentsNeedingSignature.length === 0,
      href: '/documents',
    },
    {
      label: 'Check payments',
      complete: openInvoices.length === 0,
      href: '/invoices',
    },
    {
      label: 'Upload insurance',
      complete: insuranceOnFile,
      href: '/profile',
    },
    {
      label: 'Text alerts',
      complete: camper?.sms_opt_in === true,
      href: '/invoices',
    },
    {
      label: 'Plan next event',
      complete: !nextEvent,
      href: '/calendar',
    },
  ]
  const completedTasks = firstLoginTasks.filter((task) => task.complete).length
  const weekendFocus = documentsNeedingSignature.length
    ? {
        href: '/documents',
        title: 'Signature needed',
        detail: `${documentsNeedingSignature.length} document${documentsNeedingSignature.length === 1 ? '' : 's'} waiting for you.`,
        action: 'Review documents',
      }
    : openInvoices.length
      ? {
          href: '/invoices',
          title: 'Balance to review',
          detail: `$${openBalance.toFixed(2)} open across ${openInvoices.length} invoice${openInvoices.length === 1 ? '' : 's'}.`,
          action: 'Open billing',
        }
      : nextEvent
        ? {
            href: '/calendar',
            title: 'Plan around the next event',
            detail: `${nextEvent.title} is coming up ${formatDate(nextEvent.event_date)}.`,
            action: 'View calendar',
          }
        : {
            href: '/maintenance',
            title: 'Everything looks calm',
            detail: 'No urgent portal items right now. Enjoy your time at Bur Oaks.',
            action: 'Need maintenance?',
        }
  const today = new Date().toISOString().slice(0, 10)
  const upcomingDinners = saturdayDinners2026
    .filter((dinner) => dinner.date >= today && !dinner.closed)
    .slice(0, 2)
  const siteReadiness = [
    { label: 'Profile', value: `${profileCompletion}%`, complete: profileCompletion >= 80 },
    { label: 'Documents', value: documentsNeedingSignature.length ? `${documentsNeedingSignature.length} open` : 'Clear', complete: documentsNeedingSignature.length === 0 },
    { label: 'Balance', value: openInvoices.length ? `$${openBalance.toFixed(2)}` : '$0.00', complete: openInvoices.length === 0 },
    { label: 'Maintenance', value: activeMaintenance.length ? latestMaintenanceStatus : latestMaintenance?.status === 'Completed' ? 'Completed' : 'None', complete: activeMaintenance.length === 0 },
  ]
  const urgentCount =
    (documentsNeedingSignature.length ? 1 : 0) +
    (openInvoices.length ? 1 : 0) +
    (activeMaintenance.length ? 1 : 0)
  const nextDinner = upcomingDinners[0]
  const portalMood = urgentCount
    ? `${urgentCount} thing${urgentCount === 1 ? '' : 's'} need attention`
    : 'Your portal is all caught up'
  const portalSeason = getPortalSeason()
  const urgentAnnouncement = announcements.find((announcement) => announcement.is_urgent)
  const campgroundPulse = [
    {
      label: 'Next dinner',
      value: nextDinner ? `${nextDinner.month} ${nextDinner.day}` : 'Menu',
      detail: nextDinner?.menu || 'View schedule',
      href: nextDinner ? `/dinners?date=${nextDinner.date}` : '/dinners',
      icon: Soup,
    },
    {
      label: 'Next event',
      value: nextEvent?.title || 'Calendar',
      detail: nextEvent ? formatDate(nextEvent.event_date) : 'See what is coming up',
      href: '/calendar',
      icon: CalendarDays,
    },
    {
      label: 'Office notes',
      value: announcements.length ? announcements.length : 'Clear',
      detail: urgentAnnouncement ? 'Urgent notice posted' : latestAnnouncement?.title || 'No new announcements',
      href: '/portal',
      icon: Megaphone,
    },
    {
      label: 'Weather plan',
      value: 'Live forecast',
      detail: 'Check the weekend before you pack',
      href: '#weather',
      icon: Sparkles,
    },
  ]
  const camperInitials = `${camper?.first_name?.[0] || ''}${camper?.last_name?.[0] || ''}`.toUpperCase() || 'BO'
  const identityBadges = [
    { label: 'Profile', value: `${profileCompletion}%`, complete: profileCompletion >= 80 },
    { label: 'Insurance', value: insuranceOnFile ? 'On file' : 'Needed', complete: insuranceOnFile },
    { label: 'Texts', value: camper?.sms_opt_in ? 'On' : 'Off', complete: camper?.sms_opt_in === true },
  ]
  const whatIsNew = [
    ...(unreadOfficeMessages > 0
      ? [{
          href: '/messages',
          label: 'Office message',
          title: `${unreadOfficeMessages} unread message${unreadOfficeMessages === 1 ? '' : 's'}`,
          tone: 'urgent',
          icon: MessageCircle,
        }]
      : []),
    ...(urgentAnnouncement
      ? [{
          href: '/portal',
          label: 'Urgent notice',
          title: urgentAnnouncement.title,
          tone: 'urgent',
          icon: Megaphone,
        }]
      : []),
    ...(documentsNeedingSignature.length
      ? [{
          href: '/documents',
          label: 'Signature needed',
          title: `${documentsNeedingSignature.length} document${documentsNeedingSignature.length === 1 ? '' : 's'} waiting`,
          tone: 'attention',
          icon: FileText,
        }]
      : []),
    ...(openInvoices.length
      ? [{
          href: '/invoices',
          label: 'Payment ready',
          title: `$${openBalance.toFixed(2)} open balance`,
          tone: 'attention',
          icon: ReceiptText,
        }]
      : []),
    ...(activeMaintenance.length
      ? [{
          href: '/maintenance',
          label: 'Maintenance',
          title: maintenanceHeadline,
          tone: 'attention',
          icon: Wrench,
        }]
      : []),
    ...(nextDinner
      ? [{
          href: `/dinners?date=${nextDinner.date}`,
          label: 'Saturday dinner',
          title: `${nextDinner.month} ${nextDinner.day}: ${nextDinner.menu}`,
          tone: 'good',
          icon: Soup,
        }]
      : []),
    ...(nextEvent
      ? [{
          href: '/calendar',
          label: 'Next event',
          title: `${nextEvent.title} · ${formatDate(nextEvent.event_date)}`,
          tone: 'good',
          icon: CalendarDays,
        }]
      : []),
  ].slice(0, 5)

  return (
    <main className="camper-portal-page">
      <div className="portal-shell">
        <section className={`portal-hero portal-season-${portalSeason}`}>
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

            <PortalWeatherMini variant="hero" />

            <section className="portal-identity-card" aria-label="Camper site badge">
              <div className="portal-identity-avatar">{camperInitials}</div>
              <div>
                <small>My Bur Oaks site</small>
                <strong>Lot {camper?.lot_number || '—'}</strong>
                <span>{camper?.first_name || ''} {camper?.last_name || ''}</span>
              </div>
              <div className="portal-identity-badges">
                {identityBadges.map((badge) => (
                  <a className={badge.complete ? 'complete' : 'attention'} href={badge.label === 'Texts' ? '/invoices' : '/profile'} key={badge.label}>
                    {badge.complete ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                    <span>{badge.label}: {badge.value}</span>
                  </a>
                ))}
              </div>
            </section>

            <div className="portal-hero-actions">
              <a className="portal-primary-action" href="/invoices">
                Billing & payments <ArrowRight size={18} />
              </a>
              <a className="portal-secondary-action" href="/site">
                View my site
              </a>
              <a className="portal-secondary-action" href="/maintenance">
                Request maintenance
              </a>
            </div>
          </div>

        </section>

        <section className="portal-arrival-card" aria-label="Today at your site">
          <div className="portal-arrival-main">
            <span><Sparkles size={16} /> {formatFriendlyToday()}</span>
            <h2>Lot {camper?.lot_number || '—'} is ready for the weekend.</h2>
            <p>{portalMood}. Weather, billing, documents, dinners, and requests are all gathered here so you do not have to hunt around.</p>
            {unreadOfficeMessages > 0 && (
              <a className="portal-office-message-alert" href="/messages">
                <span><MessageCircle size={17} /> New message from office</span>
                <strong>{unreadOfficeMessages}</strong>
              </a>
            )}
            <div className="portal-arrival-actions">
              <a href={weekendFocus.href}>{weekendFocus.action} <ArrowRight size={16} /></a>
              <a href="/dinners">Saturday dinners</a>
              <a href="/maintenance">Need help?</a>
            </div>
          </div>

          <div className="portal-arrival-status">
            <a href="/invoices" className={openInvoices.length ? 'attention' : 'good'}>
              <small>Balance</small>
              <strong>{openInvoices.length ? `$${openBalance.toFixed(2)}` : '$0.00'}</strong>
              <em>{openInvoices.length ? `${openInvoices.length} invoice${openInvoices.length === 1 ? '' : 's'} open` : 'Nothing due'}</em>
            </a>
            <a href="/documents" className={documentsNeedingSignature.length ? 'attention' : 'good'}>
              <small>Documents</small>
              <strong>{documentsNeedingSignature.length || documents.length}</strong>
              <em>{documentsNeedingSignature.length ? 'Need signature' : 'Ready'}</em>
            </a>
            <a href="/maintenance" className={activeMaintenance.length ? 'attention' : 'good'}>
              <small>Requests</small>
              <strong>{activeMaintenance.length || '0'}</strong>
              <em>{activeMaintenance.length ? latestMaintenanceStatus : 'No active work'}</em>
            </a>
            <a href={nextDinner ? `/dinners?date=${nextDinner.date}` : '/dinners'} className="good">
              <small>Next dinner</small>
              <strong>{nextDinner ? `${nextDinner.month} ${nextDinner.day}` : 'Menu'}</strong>
              <em>{nextDinner?.menu || 'View schedule'}</em>
            </a>
          </div>
        </section>

        <section className="portal-command-center" aria-label="What is new at Bur Oaks">
          <div className="portal-command-heading">
            <div>
              <span><Bell size={16} /> WHAT’S NEW</span>
              <h2>Your quick check before you head out.</h2>
            </div>
            <a href="/messages">Message office <ArrowRight size={16} /></a>
          </div>

          <div className="portal-command-grid">
            {whatIsNew.length === 0 ? (
              <article className="portal-command-item good">
                <CheckCircle2 size={20} />
                <span>
                  <small>All clear</small>
                  <strong>No new action items right now</strong>
                </span>
              </article>
            ) : (
              whatIsNew.map((item) => {
                const Icon = item.icon

                return (
                  <a className={`portal-command-item ${item.tone}`} href={item.href} key={`${item.label}-${item.title}`}>
                    <Icon size={20} />
                    <span>
                      <small>{item.label}</small>
                      <strong>{item.title}</strong>
                    </span>
                    <ChevronRight size={18} />
                  </a>
                )
              })
            )}
          </div>
        </section>

        <section className="portal-pulse-card" aria-label="Campground pulse">
          <div>
            <span><Sparkles size={16} /> CAMPGROUND PULSE</span>
            <h2>What’s happening around Bur Oaks.</h2>
          </div>
          <div className="portal-pulse-grid">
            {campgroundPulse.map((item) => {
              const Icon = item.icon

              return (
                <a href={item.href} key={item.label}>
                  <Icon size={20} />
                  <small>{item.label}</small>
                  <strong>{item.value}</strong>
                  <em>{item.detail}</em>
                </a>
              )
            })}
          </div>
        </section>

        <section className="portal-pumpout-alert">
          <div>
            <span><Droplets size={18} /> SEWER PUMP-OUT</span>
            <h2>Need your sewer pumped?</h2>
            <p>Tap the red button and the office will add you to the pump-out list. A $10 charge is added to your next electric bill.</p>
            {pumpMessage && <small>{pumpMessage}</small>}
          </div>
          <button type="button" onClick={requestSewerPumpOut} disabled={requestingPump}>
            {requestingPump ? 'Sending…' : 'Request pump-out'}
          </button>
        </section>

        <div id="weather">
          <PortalWeather />
        </div>

        <section className="portal-quick-actions" aria-label="Camper quick actions">
          <a className={openInvoices.length ? 'attention' : ''} href="/invoices">
            <ReceiptText size={20} />
            <span>
              <small>{openInvoices.length ? 'Payment ready' : 'Billing'}</small>
              <strong>{openInvoices.length ? `$${openBalance.toFixed(2)} open` : 'All clear'}</strong>
            </span>
          </a>
          <a className={documentsNeedingSignature.length ? 'attention' : ''} href="/documents">
            <FileText size={20} />
            <span>
              <small>{documentsNeedingSignature.length ? 'Signature needed' : 'Documents'}</small>
              <strong>{documentsNeedingSignature.length ? `${documentsNeedingSignature.length} waiting` : `${documents.length} available`}</strong>
            </span>
          </a>
          <a href="/maintenance">
            <Wrench size={20} />
            <span>
              <small>Maintenance</small>
              <strong>{activeMaintenance.length ? `${activeMaintenance.length} active` : 'Request help'}</strong>
            </span>
          </a>
          <a className={unreadOfficeMessages > 0 ? 'attention' : ''} href="/messages">
            <MessageCircle size={20} />
            <span>
              <small>{unreadOfficeMessages > 0 ? 'New office message' : 'Messages'}</small>
              <strong>{unreadOfficeMessages > 0 ? `${unreadOfficeMessages} unread` : 'Contact office'}</strong>
            </span>
          </a>
          <a href={upcomingDinners[0] ? `/dinners?date=${upcomingDinners[0].date}` : '/dinners'}>
            <Soup size={20} />
            <span>
              <small>Saturday dinner</small>
              <strong>{upcomingDinners[0] ? `${upcomingDinners[0].month} ${upcomingDinners[0].day}` : 'View menu'}</strong>
            </span>
          </a>
        </section>

        <section className="portal-weekend-planner">
          <div className="portal-planner-main">
            <span><Sparkles size={16} /> WEEKEND PLANNER</span>
            <h2>{weekendFocus.title}</h2>
            <p>{weekendFocus.detail}</p>
            <div className="portal-planner-actions">
              <a href={weekendFocus.href}>{weekendFocus.action} <ArrowRight size={16} /></a>
              <a href="/site">Open My Site</a>
            </div>

            {upcomingDinners.length > 0 && (
              <div className="portal-planner-dinners">
                <div>
                  <Soup size={16} />
                  <span>Saturday dinner</span>
                </div>
                {upcomingDinners.map((dinner) => (
                  <a href={`/dinners?date=${dinner.date}`} key={dinner.id}>
                    <small>{dinner.month} {dinner.day} · 6 PM</small>
                    <strong>{dinner.menu}</strong>
                    {dinner.theme && <em>{dinner.theme}</em>}
                  </a>
                ))}
              </div>
            )}
          </div>

          <div className="portal-readiness-stack">
            {siteReadiness.map((item) => (
              <article className={item.complete ? 'complete' : 'attention'} key={item.label}>
                <span>{item.complete ? <CheckCircle2 size={17} /> : <AlertTriangle size={17} />}</span>
                <div>
                  <small>{item.label}</small>
                  <strong>{item.value}</strong>
                </div>
              </article>
            ))}
          </div>

          <aside className="portal-next-best">
            <ShieldCheck size={24} />
            <div>
              <small>Campground concierge</small>
              <strong>{nextEvent ? nextEvent.title : 'No event posted yet'}</strong>
              <p>{nextEvent ? `${formatDate(nextEvent.event_date)} · RSVP and see event details.` : 'Check back for the next Bur Oaks event.'}</p>
            </div>
            <a href="/calendar">Events</a>
          </aside>
        </section>

        <EventFlyerShowcase context="portal" limit={4} />

        <section className="portal-weekend-brief">
          <div className="portal-section-heading">
            <div>
              <span>THIS WEEKEND AT BUR OAKS</span>
              <h2>A quick glance before you pack the cooler</h2>
            </div>
            <a href="/calendar">See all events <ArrowRight size={16} /></a>
          </div>

          <div className="portal-weekend-brief-grid">
            <article>
              <CalendarDays size={22} />
              <small>Next event</small>
              <strong>{nextEvent?.title || 'Nothing posted yet'}</strong>
              <p>{nextEvent ? `${formatDate(nextEvent.event_date)} · RSVP from the calendar.` : 'The next campground event will show here as soon as it is posted.'}</p>
            </article>

            <article>
              <Megaphone size={22} />
              <small>Latest note</small>
              <strong>{latestAnnouncement?.title || 'No new announcements'}</strong>
              <p>{latestAnnouncement?.message || 'Important campground updates will appear right here.'}</p>
            </article>

            <article>
              <Wrench size={22} />
              <small>Site check</small>
              <strong>{maintenanceHeadline}</strong>
              <p>{maintenanceDetail}</p>
            </article>
          </div>
        </section>

        <section className="portal-today-panel">
          <div className="portal-section-heading">
            <div>
              <span>TODAY AT BUR OAKS</span>
              <h2>Your quick campground check-in</h2>
            </div>
            <em>{completedTasks} of {firstLoginTasks.length} launch items complete</em>
          </div>

          <div className="portal-today-grid">
            <a className={`portal-today-card ${documentsNeedingSignature.length ? 'needs-attention' : 'complete'}`} href="/documents">
              <span>{documentsNeedingSignature.length ? <AlertTriangle size={22} /> : <CheckCircle2 size={22} />}</span>
              <small>Documents</small>
              <strong>{documentsNeedingSignature.length ? `${documentsNeedingSignature.length} need signature` : 'All caught up'}</strong>
              <p>{documentsNeedingSignature.length ? 'Review and sign assigned leases or renewals.' : 'No documents need your signature right now.'}</p>
            </a>

            <a className={`portal-today-card ${openInvoices.length ? 'needs-attention' : 'complete'}`} href="/invoices">
              <span>{openInvoices.length ? <CircleDollarSign size={22} /> : <CheckCircle2 size={22} />}</span>
              <small>Payments</small>
              <strong>{openInvoices.length ? `$${openBalance.toFixed(2)} open` : 'Balance clear'}</strong>
              <p>{openInvoices.length ? `${openInvoices.length} invoice${openInvoices.length === 1 ? '' : 's'} ready to review.` : 'No open invoices are due in the portal.'}</p>
            </a>

            <a className="portal-today-card" href="/maintenance">
              <span><Wrench size={22} /></span>
              <small>Maintenance</small>
              <strong>{maintenanceHeadline}</strong>
              <p>{latestMaintenance ? maintenanceDetail : 'Submit a request if something needs attention.'}</p>
            </a>

            <a className="portal-today-card" href="/profile">
              <span><ClipboardCheck size={22} /></span>
              <small>Profile</small>
              <strong>{profileCompletion}% complete</strong>
              <p>Keep contact, emergency, vehicle, and golf cart information current.</p>
            </a>
          </div>

          <div className="portal-launch-checklist">
            {firstLoginTasks.map((task) => (
              <a href={task.href} className={task.complete ? 'done' : ''} key={task.label}>
                {task.complete ? <CheckCircle2 size={16} /> : <span />}
                {task.label}
              </a>
            ))}
          </div>
        </section>

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
              <strong>{documentsNeedingSignature.length || documents.length}</strong>
              <em>{documentsNeedingSignature.length ? 'Need signature' : 'Available in your portal'}</em>
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
                {[...announcements]
                  .sort((a, b) => Number(Boolean(b.is_urgent)) - Number(Boolean(a.is_urgent)))
                  .map((announcement, index) => (
                  <article className={`${index === 0 ? 'featured' : ''} ${announcement.is_urgent ? 'urgent' : ''}`} key={announcement.id}>
                    {(index === 0 || announcement.is_urgent) && <span className={`portal-new-pill ${announcement.is_urgent ? 'urgent' : ''}`}>{announcement.is_urgent ? 'URGENT' : 'LATEST'}</span>}
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
              <div className="portal-empty-state horizontal portal-campfire-empty">
                <CalendarDays size={26} />
                <p>The calendar is quiet for the moment — enjoy the peace, or check Saturday dinners.</p>
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
                        <a className="portal-event-action" href="/calendar">RSVP / details <ArrowRight size={13} /></a>
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
              <div className="portal-empty-state horizontal portal-campfire-empty">
                <Bell size={26} />
                <p>You’re all caught up — no recent alerts, no smoke signals, no surprises.</p>
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

        <section className="portal-site-command">
          <div>
            <span><Home size={16} /> MY SITE</span>
            <h2>Lot {camper?.lot_number || '—'} at a glance.</h2>
            <p>One calm place for contact info, second profile details, vehicles, documents, insurance, payments, electric history, and maintenance requests.</p>
          </div>
          <div className="portal-site-command-grid">
            <article><small>Camper</small><strong>{camper?.first_name || ''} {camper?.last_name || ''}</strong></article>
            <article><small>Latest electric</small><strong>{latestElectric ? `${latestElectric.kwh_used || 0} kWh` : 'No reading'}</strong></article>
            <article><small>Open balance</small><strong>${openBalance.toFixed(2)}</strong></article>
            <article><small>Insurance</small><strong>{insuranceOnFile ? 'On file' : 'Needed'}</strong></article>
            <article><small>Text alerts</small><strong>{camper?.sms_opt_in ? 'On' : 'Off'}</strong></article>
            <article><small>Office messages</small><strong>{unreadOfficeMessages ? `${unreadOfficeMessages} unread` : 'Clear'}</strong></article>
          </div>
          <a href="/site">Open My Site <ArrowRight size={16} /></a>
        </section>

        <footer className="portal-footer">
          <span>Bur Oaks Campground</span>
          <span>
            <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a> · Lot{' '}
            {camper?.lot_number || '—'} · {camper?.first_name} {camper?.last_name}
          </span>
        </footer>

        <nav className="portal-mobile-dock" aria-label="Quick portal navigation">
          <a href="/invoices" className={openInvoices.length ? 'attention' : ''}>
            <ReceiptText size={18} />
            <span>Pay</span>
          </a>
          <a href="/documents" className={documentsNeedingSignature.length ? 'attention' : ''}>
            <FileText size={18} />
            <span>Docs</span>
          </a>
          <a href="/maintenance">
            <Wrench size={18} />
            <span>Fix</span>
          </a>
          <a href="/dinners">
            <Soup size={18} />
            <span>Dinner</span>
          </a>
          <button type="button" onClick={requestSewerPumpOut} disabled={requestingPump}>
            <Droplets size={18} />
            <span>Pump</span>
          </button>
        </nav>
      </div>
    </main>
  )
}
